/** UK club season convention: 1 September to 31 August, labelled by its start/end years. */
export function currentSeasonLabel(today = new Date()): string {
  const year = today.getFullYear();
  const startYear = today.getMonth() >= 8 ? year : year - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}
