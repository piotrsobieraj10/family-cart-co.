import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, UNITS } from "@/lib/categories";
import { compressToWebP } from "@/lib/image-compress";
import { logActivity } from "@/lib/household";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";

export const Route = createFileRoute("/add")({ component: AddPage });

function AddPage() {
  return (
    <RequireAuth>
      {({ userId, householdId }) => <Inner userId={userId} householdId={householdId} />}
    </RequireAuth>
  );
}

function Inner({ userId, householdId }: { userId: string; householdId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<string>("szt.");
  const [category, setCategory] = useState<string>("Inne");
  const [note, setNote] = useState("");
  const [exact, setExact] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onPhoto = (f: File | null) => {
    setPhoto(f);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      // Ensure active list
      const { data: existing } = await supabase
        .from("shopping_lists")
        .select("id")
        .eq("household_id", householdId)
        .in("status", ["active", "shopping", "partially_done"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let listId = existing?.id;
      if (!listId) {
        const { data: created, error: lerr } = await supabase
          .from("shopping_lists")
          .insert({ household_id: householdId, created_by: userId, name: "Lista zakupów" })
          .select("id")
          .single();
        if (lerr) throw lerr;
        listId = created.id;
      }

      const { data: item, error } = await supabase
        .from("shopping_items")
        .insert({
          list_id: listId,
          household_id: householdId,
          name: name.trim(),
          quantity: quantity ? Number(quantity) : null,
          unit,
          category,
          note: note.trim() || null,
          exact_match_required: exact,
          added_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (photo) {
        try {
          const compressed = await compressToWebP(photo);
          const base = `${householdId}/${item.id}`;
          const thumbPath = `${base}/thumb.webp`;
          const prevPath = `${base}/preview.webp`;
          const up1 = await supabase.storage.from("product-photos").upload(thumbPath, compressed.thumbnail, { contentType: "image/webp", upsert: true });
          if (up1.error) throw up1.error;
          const up2 = await supabase.storage.from("product-photos").upload(prevPath, compressed.preview, { contentType: "image/webp", upsert: true });
          if (up2.error) throw up2.error;
          const thumbUrl = supabase.storage.from("product-photos").getPublicUrl(thumbPath).data.publicUrl;
          const prevUrl = supabase.storage.from("product-photos").getPublicUrl(prevPath).data.publicUrl;
          await supabase.from("item_photos").insert({
            item_id: item.id,
            household_id: householdId,
            storage_path: prevPath,
            thumbnail_url: thumbUrl,
            preview_url: prevUrl,
            width: compressed.width,
            height: compressed.height,
            created_by: userId,
          });
        } catch (perr) {
          toast.error("Nie udało się dodać zdjęcia: " + (perr instanceof Error ? perr.message : ""));
        }
      }

      void logActivity({
        household_id: householdId,
        user_id: userId,
        action: "item_added",
        description: name.trim(),
        list_id: listId,
        item_id: item.id,
      });

      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["active-list", householdId] });
      toast.success("Dodano produkt");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Dodaj produkt">
      <form onSubmit={submit} className="space-y-3">
        <input
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Co kupić? np. Mleko 2%"
          className="w-full px-4 py-4 rounded-2xl bg-card border border-border text-base"
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl px-3 py-2">
            <label className="text-xs text-muted-foreground">Ilość</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-transparent outline-none text-base"
            />
          </div>
          <div className="bg-card border border-border rounded-2xl px-3 py-2">
            <label className="text-xs text-muted-foreground">Jednostka</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full bg-transparent outline-none text-base">
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl px-3 py-2">
          <label className="text-xs text-muted-foreground">Kategoria</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-transparent outline-none text-base">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notatka (opcjonalnie)"
          rows={2}
          className="w-full px-4 py-3 rounded-2xl bg-card border border-border"
        />

        <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium">Kup dokładnie taki jak na zdjęciu</span>
            <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} className="w-5 h-5 accent-primary" />
          </label>
          <p className="text-xs text-muted-foreground">
            Wyłączone = może być podobny zamiennik.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Zdjęcie</span>
            {photo && (
              <button type="button" onClick={() => onPhoto(null)} className="text-xs text-destructive flex items-center gap-1">
                <X className="w-3 h-3" /> Usuń
              </button>
            )}
          </div>
          {photoPreview ? (
            <img src={photoPreview} alt="podgląd" className="w-full max-h-64 object-contain rounded-xl bg-muted" />
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-border rounded-xl text-muted-foreground cursor-pointer">
              <Camera className="w-6 h-6" />
              <span className="text-sm">Zrób zdjęcie lub wybierz z galerii</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          )}
        </div>

        <button disabled={busy || !name.trim()} className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60">
          {busy ? "Dodaję…" : "Dodaj do listy"}
        </button>
      </form>
    </AppShell>
  );
}