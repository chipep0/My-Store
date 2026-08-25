"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { guardedDelete, guardedUpdate } from "@/lib/db";
import { useSettings } from "@/contexts/SettingsContext";
import { money, localDateStr, defaultFromDate } from "@/lib/format";
import { groupByPeriod, GroupMode } from "@/lib/grouping";
import type { Expense, OtherIncome } from "@/lib/types";
import Loading from "@/components/Loading";

type Tab = "expenses" | "income";

export default function ExpensesPage() {
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>("expenses");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<OtherIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupMode>("day");
  const [expModal, setExpModal] = useState<"add" | Expense | null>(null);
  const [incModal, setIncModal] = useState<"add" | OtherIncome | null>(null);
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(() => localDateStr(new Date()));
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: exp }, { data: inc }] = await Promise.all([
      supabase.from("posinv_expenses").select("id,expense_on,category,description,amount").gte("expense_on", from).lte("expense_on", to).order("expense_on", { ascending: false }).limit(1000),
      supabase.from("posinv_other_income").select("id,received_on,category,recipient,description,amount").gte("received_on", from).lte("received_on", to).order("received_on", { ascending: false }).limit(1000),
    ]);
    setExpenses(exp || []);
    setIncome(inc || []);
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const term = search.trim().toLowerCase();
  const filteredExpenses = useMemo(
    () => (term ? expenses.filter((x) => x.category.toLowerCase().includes(term) || (x.description || "").toLowerCase().includes(term)) : expenses),
    [expenses, term]
  );
  const filteredIncome = useMemo(
    () =>
      term
        ? income.filter((x) => x.category.toLowerCase().includes(term) || (x.recipient || "").toLowerCase().includes(term) || (x.description || "").toLowerCase().includes(term))
        : income,
    [income, term]
  );

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

  const expenseGroups = useMemo(() => groupByPeriod(filteredExpenses, groupBy, (x) => x.expense_on, (x) => x.amount), [filteredExpenses, groupBy]);
  const incomeGroups = useMemo(() => groupByPeriod(filteredIncome, groupBy, (x) => x.received_on, (x) => x.amount), [filteredIncome, groupBy]);

  return (
    <div className="view">
      <div className="vhead" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{tab === "expenses" ? "Expenses" : "Other Income"}</span>
        <button className="btn sm" onClick={() => (tab === "expenses" ? setExpModal("add") : setIncModal("add"))}>
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
          Money that came in outside the till — e.g. a customer paid straight into the bank, or a wholesale order was settled
          directly. Adds to that day&apos;s Total sales in Reports.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", margin: "0 0 12px" }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label>Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Category, description…" />
        </div>
      </div>

      <div className="chips" style={{ padding: "0 0 12px" }}>
        {(["day", "week", "month", "quarter"] as GroupMode[]).map((m) => (
          <button key={m} className={`chip${groupBy === m ? " on" : ""}`} onClick={() => setGroupBy(m)}>
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : tab === "expenses" ? (
        !filteredExpenses.length ? (
          <div className="empty">No expenses match this date range/search.</div>
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
                    <button className="act-edit" onClick={() => setExpModal(x)}>
                      Edit
                    </button>
                    <button className="act-void" onClick={() => deleteExpense(x.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )
      ) : !filteredIncome.length ? (
        <div className="empty">No other income matches this date range/search.</div>
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
                  <button className="act-edit" onClick={() => setIncModal(x)}>
                    Edit
                  </button>
                  <button className="act-void" onClick={() => deleteIncome(x.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      {expModal && (
        <AddExpenseModal
          editItem={expModal === "add" ? null : expModal}
          onClose={() => setExpModal(null)}
          onSaved={() => {
            setExpModal(null);
            load();
          }}
        />
      )}
      {incModal && (
        <AddIncomeModal
          editItem={incModal === "add" ? null : incModal}
          onClose={() => setIncModal(null)}
          onSaved={() => {
            setIncModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddExpenseModal({ editItem, onClose, onSaved }: { editItem?: Expense | null; onClose: () => void; onSaved: () => void }) {
  const editing = !!editItem;
  const [date, setDate] = useState(() => editItem?.expense_on || localDateStr(new Date()));
  const [category, setCategory] = useState(editItem?.category || "");
  const [description, setDescription] = useState(editItem?.description || "");
  const [amount, setAmount] = useState(editItem ? String(editItem.amount) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return alert("Enter an amount greater than 0.");
    setSaving(true);
    try {
      const fields = {
        expense_on: date,
        category: category.trim() || "Other",
        description: description.trim(),
        amount: amt,
      };
      if (editing) {
        const res = await guardedUpdate("posinv_expenses", "id", editItem!.id, fields, "editing expenses");
        if (!res.ok) throw new Error(res.error);
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.from("posinv_expenses").insert({ ...fields, created_by: user?.id });
        if (error) throw error;
      }
      onSaved();
    } catch (err) {
      alert("Could not save expense: " + (err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="mbox">
        <h3>{editing ? "Edit expense" : "Add expense"}</h3>
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
          {saving ? "Saving…" : editing ? "Save changes" : "Save expense"}
        </button>
        <button className="btn sec" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddIncomeModal({ editItem, onClose, onSaved }: { editItem?: OtherIncome | null; onClose: () => void; onSaved: () => void }) {
  const editing = !!editItem;
  const [date, setDate] = useState(() => editItem?.received_on || localDateStr(new Date()));
  const [category, setCategory] = useState(editItem?.category || "");
  const [recipient, setRecipient] = useState(editItem?.recipient || "");
  const [description, setDescription] = useState(editItem?.description || "");
  const [amount, setAmount] = useState(editItem ? String(editItem.amount) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return alert("Enter an amount greater than 0.");
    setSaving(true);
    try {
      const fields = {
        received_on: date,
        category: category.trim() || "Bank Transfer",
        recipient: recipient.trim(),
        description: description.trim(),
        amount: amt,
      };
      if (editing) {
        const res = await guardedUpdate("posinv_other_income", "id", editItem!.id, fields, "editing other income");
        if (!res.ok) throw new Error(res.error);
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.from("posinv_other_income").insert({ ...fields, created_by: user?.id });
        if (error) throw error;
      }
      onSaved();
    } catch (err) {
      alert("Could not save income: " + (err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="mbox">
        <h3>{editing ? "Edit other income" : "Add other income"}</h3>
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

        <button className="checkout" style={{ background: "var(--teal)", marginTop: 14 }} disabled={saving} onClick={save}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save income"}
        </button>
        <button className="btn sec" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
