#!/usr/bin/env python3
"""
Push pending local commits to GitHub using the Git Data API.
Útil cuando Zscaler bloquea git push.

Uso:
    python3 scripts/push_via_api.py

Requisitos:
  - gh CLI autenticado (gh auth status)
  - Estar en la raíz del repositorio
  - Tener commits locales pendientes de subir (git status -sb muestra [ahead N])
"""
import subprocess, json, base64, sys, os

REPO = "Guskermit/xne"

def run(cmd, **kwargs):
    return subprocess.run(cmd, capture_output=True, text=True, **kwargs)

def gh_api(method, endpoint, data=None):
    cmd = ["gh", "api", "--method", method, endpoint]
    inp = json.dumps(data).encode() if data is not None else None
    if inp:
        cmd += ["--input", "-"]
    r = subprocess.run(cmd, input=inp, capture_output=True)
    if r.returncode != 0:
        print(f"ERROR: {method} {endpoint}")
        print(r.stderr.decode())
        sys.exit(1)
    return json.loads(r.stdout)

def main():
    # --- Verificar que hay commits pendientes ---
    base_sha  = run(["git", "rev-parse", "origin/main"]).stdout.strip()
    head_sha  = run(["git", "rev-parse", "HEAD"]).stdout.strip()

    if base_sha == head_sha:
        print("Nothing to push — local is already in sync with origin/main.")
        sys.exit(0)

    base_tree = run(["git", "rev-parse", "origin/main^{tree}"]).stdout.strip()

    # Ficheros cambiados entre origin/main y HEAD
    changed = run(["git", "diff", "--name-only", "origin/main..HEAD"]).stdout.strip().splitlines()
    deleted = run(["git", "diff", "--name-only", "--diff-filter=D", "origin/main..HEAD"]).stdout.strip().splitlines()
    deleted_set = set(deleted)

    if not changed:
        print("No changed files detected.")
        sys.exit(0)

    print(f"==> {len(changed)} file(s) to push (base: {base_sha[:10]})")

    # --- Crear blobs para ficheros añadidos/modificados ---
    tree_entries = []
    for fpath in changed:
        if fpath in deleted_set:
            # Fichero eliminado: indicar null sha en el árbol
            tree_entries.append({"path": fpath, "mode": "100644", "type": "blob", "sha": None})
            print(f"  delete : {fpath}")
            continue
        if not os.path.exists(fpath):
            print(f"  SKIP (not found): {fpath}")
            continue
        with open(fpath, "rb") as fp:
            content = base64.b64encode(fp.read()).decode()
        blob = gh_api("POST", f"/repos/{REPO}/git/blobs", {"content": content, "encoding": "base64"})
        tree_entries.append({"path": fpath, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print(f"  blob ok: {fpath} → {blob['sha'][:10]}")

    # --- Crear árbol ---
    print(f"\n==> Creating tree ({len(tree_entries)} entries, base tree: {base_tree[:10]})...")
    tree = gh_api("POST", f"/repos/{REPO}/git/trees", {"base_tree": base_tree, "tree": tree_entries})
    print(f"  tree sha: {tree['sha'][:10]}")

    # --- Crear commit ---
    commit_msg = run(["git", "log", "-1", "--format=%B", "HEAD"]).stdout.strip()
    print(f"\n==> Creating commit: {commit_msg[:70]!r}")
    commit = gh_api("POST", f"/repos/{REPO}/git/commits", {
        "message": commit_msg,
        "parents": [base_sha],
        "tree": tree["sha"],
    })
    print(f"  commit sha: {commit['sha']}")

    # --- Actualizar ref ---
    print("\n==> Updating refs/heads/main...")
    gh_api("PATCH", f"/repos/{REPO}/git/refs/heads/main", {"sha": commit["sha"], "force": False})

    # --- Sincronizar local ---
    subprocess.run(["git", "fetch", "origin"], capture_output=True)
    subprocess.run(["git", "reset", "--hard", "origin/main"])

    print(f"\n✓ Done! https://github.com/{REPO}/commit/{commit['sha']}")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    main()
