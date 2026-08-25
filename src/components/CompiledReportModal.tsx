"use client";
import { useSettings } from "@/contexts/SettingsContext";
import { money, signedMoney, qtyBoxLabel } from "@/lib/format";

export interface CompiledReport {
  label: string;
  rangeTxt: string;
  orderCount: number;
  posSales: number;
  totalPurch: number;
  totalExpenses: number;
  totalOtherIncome: number;
  totalDirectPayments: number;
  totalOutstandingDebt: number;
  showPurchases: boolean;
  products: { name: string; sku: string; total: number; qty: number; unitsPerBox: number; directPayments: { to: string; amount: number }[] }[];
  expenseLines: { category: string; description: string | null; amount: number }[];
  otherIncomeLines: { category: string; recipient: string | null; description: string | null; amount: number }[];
  purchases: { name: string; sku: string; total: number; qty: number; unitsPerBox: number }[];
}

export default function CompiledReportModal({ report, onClose }: { report: CompiledReport; onClose: () => void }) {
  const { settings } = useSettings();
  const currency = settings.currency;
  // Total sales = Products sold + Other Income — every entry always adds.
  // Products sold already includes sales paid directly to someone instead
  // of the till (stock still deducted for those). Amount sent chains
  // straight off Total sales, backing out Expenses, Other Income, and
  // direct payments again — Other Income cancels out entirely, leaving
  // Amount sent = Products sold − Expenses − Direct payments.
  const totalSales = report.posSales + report.totalOtherIncome;
  const profit = totalSales - report.totalPurch;
  const netProfit = totalSales - report.totalExpenses - report.totalOtherIncome - report.totalDirectPayments;

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
                      {p.directPayments.map((d, i) => (
                        <span key={i} style={{ color: "#888", fontSize: 11, display: "block" }}>
                          💸 {money(d.amount, currency)} sent to {d.to}
                        </span>
                      ))}
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
          {report.otherIncomeLines.length > 0 && (
            <>
              <hr />
              <div className="c">Other income (added to Total sales)</div>
              <table>
                <tbody>
                  {report.otherIncomeLines.map((x, i) => (
                    <tr key={i}>
                      <td>
                        {x.category}
                        {x.recipient && (
                          <>
                            <br />
                            <span style={{ color: "#888", fontSize: 11 }}>Sent to: {x.recipient}</span>
                          </>
                        )}
                        {x.description && (
                          <>
                            <br />
                            <span style={{ color: "#888", fontSize: 11 }}>{x.description}</span>
                          </>
                        )}
                      </td>
                      <td className="tr">{money(x.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
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
          <table>
            <tbody>
              <tr>
                <td>Orders</td>
                <td className="tr">{report.orderCount}</td>
              </tr>
              <tr>
                <td>Total sales</td>
                <td className="tr">{money(totalSales, currency)}</td>
              </tr>
              {report.totalOtherIncome > 0 && (
                <tr>
                  <td>Other income</td>
                  <td className="tr">−{money(report.totalOtherIncome, currency)}</td>
                </tr>
              )}
              {report.totalDirectPayments > 0 && (
                <tr>
                  <td>Paid directly (not till)</td>
                  <td className="tr">−{money(report.totalDirectPayments, currency)}</td>
                </tr>
              )}
              {report.totalOutstandingDebt > 0 && (
                <tr>
                  <td>Owed (debts)</td>
                  <td className="tr">{money(report.totalOutstandingDebt, currency)}</td>
                </tr>
              )}
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
                  <b>Amount sent</b>
                </td>
                <td className="tr">
                  <b>{signedMoney(netProfit, currency)}</b>
                </td>
              </tr>
            </tbody>
          </table>
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
