"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { guardedDelete } from "@/lib/db";
import { useSettings } from "@/contexts/SettingsContext";
import { money, localDateStr } from "@/lib/format";
import { groupByPeriod, GroupMode } from "@/lib/grouping";
import type { Expense, OtherIncome } from "@/lib/types";

type Tab = "expenses" | "income";

export default function ExpensesPage() {
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>("expenses");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<OtherIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupMode>("day");
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: exp }, { data: inc }] = await Promise.all([
      supabase.from("posinv_expenses").select("id,expense_on,category,description,amount").order("expense_on", { ascending: false }).limit(300),
      supabase.from("posinv_other_income").select("id,received_on,category,recipient,description,amount").order("received_on", { ascending: false }).limit(300),
    ]);
    setExpenses(exp || []);
    setIncome(inc || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deleteExpense = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    const res = await guardedDelete("posinv_expenses", "id", id, "deleting expenses");
    if (!res.ok) return alert(res.error);
    load();
  };

  const deleteIncome = async (id: number) => {
    if (!confirm("Delete this income entry?")) return;
    const res = await guardedDelete("posinv_other_income", "id", id, "deleting other income");
    if (!res.ok) return alert(res.error);
    load();
  };

  const expenseGroups = useMemo(() => groupByPeriod(expenses, groupBy, (x) => x.expense_on, (x) => x.amount), [expenses, groupBy]);
  const incomeGroups = useMemo(() => groupByPeriod(income, groupBy, (x) => x.received_on, (x) => x.amount), [income, groupBy]);

  return (
    <div className="view">
      <div className="vhead" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{tab === "expenses" ? "Expenses" : "Other Income"}</span>
        <button className="btn sm" onClick={() => setModalOpen(true)}>
          ＋ Add {tab === "expenses" ? "expense" : "income"}
        </button>
      </div>

      <div className="chips" style={{ padding: "0 0 8px" }}>
        <button className={`chip${tab === "expenses" ? " on" : ""}`} onClick={() => setTab("expenses")}>
          Expenses
        </button>
        <button className={`chip${tab === "income" ? " on" : ""}`} onClick={() => setTab("income")}>
          Other Income
        </button>
      </div>
      {tab === "income" && (
        <div style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 10px" }}>
          Money that came in but never touched the till — e.g. a customer paid directly into the bank, or sent money straight to a
          person/account. Counts toward Total revenue in Reports, but never as an expense, and never as cash at hand.
        </div>
      )}
      <div className="chips" style={{ padding: "0 0 12px" }}>
        {(["day", "week", "month", "quarter"] as GroupMode[]).map((m) => (
          <button key={m} className={`chip${groupBy === m ? " on" : ""}`} onClick={() => setGroupBy(m)}>
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty">
          <div className="spin" />
          Loading…
        </div>
      ) : tab === "expenses" ? (
        !expenses.length ? (
          <div className="empty">No expenses logged yet.</div>
        ) : (
          expenseGroups.map((g) => (
            <div key={g.label}>
              <div className="rpthead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{g.label}</span>
                <span>{money(g.total, settings.currency)}</span>
              </div>
              {g.items.map((x) => (
                <div className="listcard" style={{ marginTop: 6 }} key={x.id}>
                  <div className="top">
                    <b>{x.category}</b>
                    <span className="badge b-Void">{money(x.amount, settings.currency)}</span>
                  </div>
                  <div className="meta">
                    {new Date(x.expense_on).toLocaleDateString()}
                    {x.description ? " · " + x.description : ""}
                  </div>
                  <div className="acts">
                    <button className="act-void" onClick={() => deleteExpense(x.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )
      ) : !income.length ? (
        <div className="empty">No other income logged yet.</div>
      ) : (
        incomeGroups.map((g) => (
          <div key={g.label}>
            <div className="rpthead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{g.label}</span>
              <span>{money(g.total, settings.currency)}</span>
            </div>
            {g.items.map((x) => (
              <div className="listcard" style={{ marginTop: 6 }} key={x.id}>
                <div className="top">
                  <b>{x.category}</b>
                  <span className="badge b-Paid">{money(x.amount, settings.currency)}</span>
                </div>
                <div className="meta">
                  {new Date(x.received_on).toLocaleDateString()}
                  {x.recipient ? " · Sent to: " + x.recipient : ""}
                  {x.description ? " · " + x.description : ""}
                </div>
                <div className="acts">
                  <button className="act-void" onClick={() => deleteIncome(x.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      {modalOpen && tab === "expenses" && (
        <AddExpenseModal
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
      {modalOpen && tab === "income" && (
        <AddIncomeModal
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(() => localDateStr(new Date()));
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return alert("Enter an amount greater than 0.");
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("posinv_expenses").insert({
        expense_on: date,
        category: category.trim() || "Other",
        description: description.trim(),
        amount: amt,
        created_by: user?.id,
      });
      if (error) throw error;
      onSaved();
    } catch (err) {
      alert("Could not save expense: " + (err instanceof Error ? err.message : err) + " — run supabase/13_expenses.sql first.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="mbox">
        <h3>Add expense</h3>
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label>Category</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} list="expCatList" placeholder="e.g. Transport" />
        <datalist id="expCatList">
          {["Transaction Fee", "Transport", "Supplies", "Other"].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <label>Description (optional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. October electricity bill" />
        <label>Amount</label>
        <input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        <button className="checkout" style={{ background: "var(--teal)" }} disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save expense"}
        </button>
        <button className="btn sec" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddIncomeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(() => localDateStr(new Date()));
  const [category, setCategory] = useState("");
  const [recipient, setRecipient] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return alert("Enter an amount greater than 0.");
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("posinv_other_income").insert({
        received_on: date,
        category: category.trim() || "Bank Transfer",
        recipient: recipient.trim(),
        description: description.trim(),
        amount: amt,
        created_by: user?.id,
      });
      if (error) throw error;
      onSaved();
    } catch (err) {
      alert("Could not save income: " + (err instanceof Error ? err.message : err) + " — run supabase/18_other_income.sql first.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="mbox">
        <h3>Add other income</h3>
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label>Category</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} list="incCatList" placeholder="e.g. Bank Transfer" />
        <datalist id="incCatList">
          {["Bank Transfer", "Mobile Money", "Cheque", "Wholesale Order", "Other"].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <label>Sent to (person / account) — optional</label>
        <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="e.g. Company bank account, or a staff member's name" />
        <label>Description (optional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Payment for wholesale order #12" />
        <label>Amount</label>
        <input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        <button className="checkout" style={{ background: "var(--teal)" }} disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save income"}
        </button>
        <button className="btn sec" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
