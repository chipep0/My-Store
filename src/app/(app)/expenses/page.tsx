"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { money } from "@/lib/format";
import type { Expense } from "@/lib/types";

type GroupMode = "day" | "week" | "month" | "quarter";

function groupInfo(expenseOn: string, mode: GroupMode) {
  const d = new Date(expenseOn + "T00:00:00");
  if (mode === "week") {
    const dow = (d.getDay() + 6) % 7;
    const start = new Date(d);
    start.setDate(d.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { key: "w" + start.toISOString().slice(0, 10), sortKey: start.getTime(), label: `Week of ${start.toLocaleDateString()} – ${end.toLocaleDateString()}` };
  }
  if (mode === "month") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    return { key: "m" + d.getFullYear() + "-" + d.getMonth(), sortKey: start.getTime(), label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
  }
  if (mode === "quarter") {
    const q = Math.floor(d.getMonth() / 3);
    const start = new Date(d.getFullYear(), q * 3, 1);
    return { key: "q" + d.getFullYear() + "-" + q, sortKey: start.getTime(), label: `Q${q + 1} ${d.getFullYear()}` };
  }
  return { key: "d" + expenseOn, sortKey: d.getTime(), label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) };
}

export default function ExpensesPage() {
  useAuth();
  const { settings } = useSettings();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupMode>("day");
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("posinv_expenses").select("id,expense_on,category,description,amount").order("expense_on", { ascending: false }).limit(300);
    setExpenses(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deleteExpense = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("posinv_expenses").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  };

  const groups = useMemo(() => {
    const map: Record<string, { label: string; sortKey: number; total: number; items: Expense[] }> = {};
    expenses.forEach((x) => {
      const g = groupInfo(x.expense_on, groupBy);
      const grp = map[g.key] || (map[g.key] = { label: g.label, sortKey: g.sortKey, total: 0, items: [] });
      grp.total += Number(x.amount) || 0;
      grp.items.push(x);
    });
    return Object.values(map).sort((a, b) => b.sortKey - a.sortKey);
  }, [expenses, groupBy]);

  return (
    <div className="view">
      <div className="vhead" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Expenses</span>
        <button className="btn sm" onClick={() => setModalOpen(true)}>
          ＋ Add expense
        </button>
      </div>
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
      ) : !expenses.length ? (
        <div className="empty">No expenses logged yet.</div>
      ) : (
        groups.map((g) => (
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
      )}
      {modalOpen && (
        <AddExpenseModal
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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
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
        <input value={category} onChange={(e) => setCategory(e.target.value)} list="expCatList" placeholder="e.g. Rent" />
        <datalist id="expCatList">
          {["Rent", "Utilities", "Supplies", "Transport", "Salaries", "Other"].map((c) => (
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
