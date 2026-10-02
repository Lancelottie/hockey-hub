// Shared, additive SQL for SQLite and PostgreSQL. These records are deliberately
// outside the replaceable team snapshot: routine workspace saves cannot erase audits.
export const facilitySecuritySchema = `
CREATE TABLE IF NOT EXISTS facility_security_settings (
  club_id TEXT PRIMARY KEY REFERENCES clubs(id), data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS facility_bookings (
  id TEXT PRIMARY KEY, club_id TEXT NOT NULL REFERENCES clubs(id),
  responsible_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS facility_bookings_club_time ON facility_bookings(club_id, starts_at);
CREATE INDEX IF NOT EXISTS facility_bookings_responsible ON facility_bookings(club_id, responsible_id);
CREATE TABLE IF NOT EXISTS facility_security_checks (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES facility_bookings(id),
  kind TEXT NOT NULL CHECK(kind IN ('pre','post')), data TEXT NOT NULL,
  UNIQUE(booking_id, kind)
);
CREATE TABLE IF NOT EXISTS facility_security_evidence (
  id TEXT PRIMARY KEY, check_id TEXT NOT NULL REFERENCES facility_security_checks(id),
  data TEXT NOT NULL
);
`;
