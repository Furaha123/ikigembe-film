export interface RwandaProvince {
  name: string;
  districts: string[];
}

export const RWANDA_PROVINCES: RwandaProvince[] = [
  {
    name: 'Kigali City',
    districts: ['Gasabo', 'Kicukiro', 'Nyarugenge'],
  },
  {
    name: 'Northern Province',
    districts: ['Burera', 'Gakenke', 'Gicumbi', 'Musanze', 'Rulindo'],
  },
  {
    name: 'Southern Province',
    districts: ['Gisagara', 'Huye', 'Kamonyi', 'Muhanga', 'Nyamagabe', 'Nyanza', 'Nyaruguru', 'Ruhango'],
  },
  {
    name: 'Eastern Province',
    districts: ['Bugesera', 'Gatsibo', 'Kayonza', 'Kirehe', 'Ngoma', 'Nyagatare', 'Rwamagana'],
  },
  {
    name: 'Western Province',
    districts: ['Karongi', 'Ngororero', 'Nyabihu', 'Nyamasheke', 'Rubavu', 'Rusizi', 'Rutsiro'],
  },
];

/** Return districts for a given province name, or empty array if not found. */
export function districtsFor(province: string): string[] {
  return RWANDA_PROVINCES.find(p => p.name === province)?.districts ?? [];
}
