-- =============================================================================
-- Amplía la clave única de fact_time_charge para incluir charged_hours.
-- Motivo: un mismo empleado puede tener en el mismo día/actividad una línea de
-- horas positivas (imputación normal) y una negativa (corrección/reversión),
-- y ambas son registros distintos que deben coexistir.
-- =============================================================================

alter table te.fact_time_charge
  drop constraint if exists uq_time_charge;

alter table te.fact_time_charge
  add constraint uq_time_charge
    unique (engagement_id, employee_gui, transaction_date, activity_code, charged_hours);
