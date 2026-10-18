// Crecidas históricas con nombre. Se asocian a una cresta por fecha (ventana) y estado.
// Es una coincidencia por fecha, no un dato oficial de NWS: se rotula "likely" en la página.
type Ev = { name: string; from: string; to: string; states: string[] };
const EVENTS: Ev[] = [
  { name: 'Johnstown Flood', from: '1889-05-30', to: '1889-06-03', states: ['PA'] },
  { name: 'July 1916 flood', from: '1916-07-14', to: '1916-07-22', states: ['NC'] },
  { name: "St. Patrick's Day Flood of 1936", from: '1936-03-16', to: '1936-03-24', states: ['PA'] },
  { name: 'August 1940 flood', from: '1940-08-12', to: '1940-08-20', states: ['NC'] },
  { name: 'Hurricane Hazel', from: '1954-10-14', to: '1954-10-18', states: ['NC', 'PA'] },
  { name: 'Hurricane Diane', from: '1955-08-17', to: '1955-08-22', states: ['PA'] },
  { name: 'Hurricane Agnes', from: '1972-06-20', to: '1972-07-01', states: ['PA', 'NC'] },
  { name: 'Johnstown Flood of 1977', from: '1977-07-19', to: '1977-07-22', states: ['PA'] },
  { name: 'January 1996 snowmelt flood', from: '1996-01-18', to: '1996-01-27', states: ['PA'] },
  { name: 'Hurricane Fran', from: '1996-09-05', to: '1996-09-15', states: ['NC', 'PA'] },
  { name: 'Hurricane Floyd', from: '1999-09-15', to: '1999-09-30', states: ['NC', 'PA'] },
  { name: 'Remnants of Hurricane Frances', from: '2004-09-06', to: '2004-09-13', states: ['NC', 'PA'] },
  { name: 'Remnants of Hurricane Ivan', from: '2004-09-16', to: '2004-09-25', states: ['NC', 'PA'] },
  { name: 'June 2006 Mid-Atlantic flood', from: '2006-06-25', to: '2006-07-03', states: ['PA'] },
  { name: 'Hurricane Irene', from: '2011-08-26', to: '2011-08-31', states: ['NC', 'PA'] },
  { name: 'Tropical Storm Lee', from: '2011-09-06', to: '2011-09-15', states: ['PA'] },
  { name: 'Hurricane Matthew', from: '2016-10-07', to: '2016-10-22', states: ['NC'] },
  { name: 'Hurricane Florence', from: '2018-09-13', to: '2018-10-01', states: ['NC'] },
  { name: 'Hurricane Michael', from: '2018-10-10', to: '2018-10-16', states: ['NC'] },
  { name: 'Tropical Storm Eta', from: '2020-11-11', to: '2020-11-16', states: ['NC'] },
  { name: 'Tropical Storm Fred', from: '2021-08-16', to: '2021-08-21', states: ['NC'] },
  { name: 'Remnants of Hurricane Ida', from: '2021-09-01', to: '2021-09-06', states: ['PA'] },
  { name: 'Tropical Storm Debby', from: '2024-08-06', to: '2024-08-15', states: ['NC', 'PA'] },
  { name: 'Hurricane Helene', from: '2024-09-25', to: '2024-10-05', states: ['NC'] },
];

export function floodName(date: Date | string, state: string): string | null {
  const d = (typeof date === 'string' ? date : date.toISOString()).slice(0, 10);
  return EVENTS.find((e) => e.states.includes(state) && d >= e.from && d <= e.to)?.name ?? null;
}
