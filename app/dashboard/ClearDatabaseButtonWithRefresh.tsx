"use client";

import { useRouter } from "next/navigation";
import ClearDatabaseButton from "./ClearDatabaseButton";

export default function ClearDatabaseButtonWithRefresh() {
  const router = useRouter();
  return (
    <ClearDatabaseButton onCleared={() => router.refresh()} />
  );
}
