export interface TableColumn {
  key: string;         // field name in the data object
  label: string;       // column header text
  type?: 'text' | 'date' | 'status' | 'avatar' | 'currency' | 'number';
  fallbackKey?: string; // for avatar: use this field when key value is empty
  muted?: boolean;     // grey colour for secondary text
  width?: string;      // e.g. '200px'
}
