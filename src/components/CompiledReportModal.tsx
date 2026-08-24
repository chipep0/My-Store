"use client";
import { useSettings } from "@/contexts/SettingsContext";
import { money, signedMoney, qtyBoxLabel } from "@/lib/format";

export interface CompiledReport {
  label: string;
  rangeTxt: string;
  orderCount: number;
  totalSales: number;
  totalPurch: number;
  totalExpenses: number;
  showPurchases: boolean;
  products: { name: string; sku: string; total: number; qty: number; unitsPerBox: number }[];
  expenseLines: { category: string; description: string | null; amount: number }[];
  purchases: { name: string; sku: string; total: number; qty: number; unitsPerBox: number }[];
}

export default function CompiledReportModal({ report, onClose }: { report: CompiledReport; onClose: () => void }) {
  const { settings } = useSettings();
  const currency = settings.currency;
  const profit = report.totalSales - report.totalPurch;
  const netProfit = (report.showPurchases ? profit : report.totalSales) - report.totalExpenses;

  return (
    <div className="modal" id="reportModal">
      <div className="mbox">
        <div className="rc">
          {settings.logo_url && (
            <div className="c">
              <img src={settings.logo_url} alt="" style={{ maxHeight: 48, maxWidth: 140, objectFit: "contain" }} />
            </div>
          )}
          <h4>{settings.store_name || "Store"}</h4>
          <div className="c">{report.label}</div>
          <div className="c">{report.rangeTxt}</div>
          <hr />
          <table>
            <tbody>
              <tr>
                <td>Orders</td>
                <td className="tr">{report.orderCount}</td>
              </tr>
              <tr>
                <td>Total sales</td>
                <td className="tr">{money(report.totalSales, currency)}</td>
              </tr>
              {report.showPurchases && (
                <>
                  <tr>
                    <td>Total purchases</td>
                    <td className="tr">{money(report.totalPurch, currency)}</td>
                  </tr>
                  <tr>
                    <td>Gross profit</td>
                    <td className="tr">{signedMoney(profit, currency)}</td>
                  </tr>
                </>
              )}
              <tr>
                <td>Total expenses</td>
                <td className="tr">{money(report.totalExpenses, currency)}</td>
              </tr>
              <tr>
                <td>
                  <b>Net profit</b>
                </td>
                <td className="tr">
                  <b>{signedMoney(netProfit, currency)}</b>
                </td>
              </tr>
            </tbody>
          </table>
          <hr />
          <div className="c">Products sold</div>
          <table>
            <tbody>
              {report.products.length ? (
                report.products.map((p) => (
                  <tr key={p.sku}>
                    <td>
                      {p.name}
                      <br />
                      <span style={{ color: "#888", fontSize: 11 }}>{qtyBoxLabel(p.unitsPerBox, p.qty)}</span>
                    </td>
                    <td className="tr">{money(p.total, currency)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>No sales</td>
                </tr>
              )}
            </tbody>
          </table>
          <hr />
          <div className="c">Expenses</div>
          <table>
            <tbody>
              {report.expenseLines.length ? (
                report.expenseLines.map((x, i) => (
                  <tr key={i}>
                    <td>
                      {x.category}
                      {x.description && (
                        <>
                          <br />
                          <span style={{ color: "#888", fontSize: 11 }}>{x.description}</span>
                        </>
                      )}
                    </td>
                    <td className="tr">{money(x.amount, currency)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>No expenses</td>
                </tr>
              )}
            </tbody>
          </table>
          {report.showPurchases && (
            <>
              <hr />
              <div className="c">Purchases (restocking)</div>
              <table>
                <tbody>
                  {report.purchases.length ? (
                    report.purchases.map((p) => (
                      <tr key={p.sku}>
                        <td>
                          {p.name}
                          <br />
                          <span style={{ color: "#888", fontSize: 11 }}>{qtyBoxLabel(p.unitsPerBox, p.qty)}</span>
                        </td>
                        <td className="tr">{money(p.total, currency)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2}>No purchases</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
          <hr />
          <div className="c">Compiled {new Date().toLocaleString()}</div>
        </div>
        <button className="btn noprint" onClick={() => window.print()}>
          🖨️ Print / Share
        </button>
        <button className="btn sec noprint" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
