export type Role = "Manager" | "Staff" | "Trainee";
export type OrderType = "SALE" | "PURCHASE";
export type OrderStatus = "Open" | "Paid" | "Refund" | "Void";
export type Unit = "EA" | "BOX";

export interface Product {
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  sales_price: number;
  purchase_price: number;
  box_sales_price: number | null;
  box_purchase_price: number | null;
  units_per_box: number;
  opening_stock?: number;
  active?: boolean;
  image_url: string | null;
}

export interface InventoryRow {
  sku: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  on_hand: number;
}

export interface Order {
  id: number;
  order_on: string;
  type: OrderType;
  status: OrderStatus;
  party: string | null;
  user_name?: string | null;
  total_paid: number;
  balance_due?: number;
  created_by?: string;
}

export interface OrderPayment {
  id: number;
  order_id: number;
  paid_on: string;
  amount: number;
  note: string | null;
}

export interface OrderItem {
  id?: number;
  order_id: number;
  type: OrderType;
  sku: string;
  product_name: string;
  unit: Unit;
  qty: number;
  base_qty: number;
  amount: number;
  disc_pct: number;
  line_total: number;
}

export interface StoreSettings {
  id: 1;
  store_name: string;
  tax_name: string;
  tax_rate: number;
  currency: string;
  low_stock: number;
  footer_message: string;
  backdate_enabled: boolean;
  tax_inclusive: boolean;
  logo_url: string | null;
}

export interface Expense {
  id: number;
  expense_on: string;
  category: string;
  description: string | null;
  amount: number;
}

export interface OtherIncome {
  id: number;
  received_on: string;
  category: string;
  recipient: string | null;
  description: string | null;
  amount: number;
}

export interface AppUser {
  id: string;
  name: string;
  role: Role;
}

export interface PeriodArchive {
  id: number;
  period_type: "week" | "month" | "quarter";
  period_start: string;
  period_end: string;
  order_count: number;
  total_sales: number;
  total_purchase: number;
  gross_profit: number;
  total_expenses: number;
  net_profit: number;
  top_products: { name: string; sku: string; qty: number; total: number; boxes: number; each: number }[];
  archived_at: string;
}

export interface CartLine {
  key: string; // sku|unit
  sku: string;
  unit: Unit;
  product: Product;
  qty: number;
  disc: number; // 0..1
}
