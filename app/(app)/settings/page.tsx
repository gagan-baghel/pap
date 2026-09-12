"use client";

import { useGeo, useMe } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Avatar, Button, Chip, Field, Sheet, Toggle, TopBar } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AVAILABILITY, AVATAR_COLORS, CATEGORIES } from "@/convex/shared";
import { reverseArea } from "@/lib/places";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const EMOJIS = ["🌸", "🏸", "☕", "🎧", "🐙", "🦊", "🌵", "🍜", "🎮", "📷", "🛼", "🌊", "🔥", "🫐", "🐝", "🎸", "🧋", "⚡"];

type Me = NonNullable<ReturnType<typeof useMe>>;

export default function SettingsPage() {
  const me = useMe();
  const toast = useToast();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const deleteAccount = useMutation(api.users.deleteAccount);
  const [deleteSheet, setDeleteSheet] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (!me)
    return (
      <div className="space-y-4 p-4 pt-[calc(1.25rem+var(--sat))]">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-48 w-full rounded-card" />
        <div className="skeleton h-32 w-full rounded-card" />
      </div>
    );

  return (
    <div className="pb-10">
      <TopBar title="settings" back={`/u/${me.handle}`} />

      <div className="space-y-6 px-4 py-4">
        {/* keyed on the account so the form starts from server state without syncing effects */}
        <ProfileForm key={me._id} me={me} />
        <LocationCard me={me} />
        <PrivacyCard me={me} />
        <BlockedCard />

        <Link href="/safety" className="btn btn-light btn-block">
          🛟 safety on pap
        </Link>
        <Link href="/privacy" className="btn btn-light btn-block">
          🔒 what we know about you
        </Link>

        {me.isAdmin && (
          <Link href="/admin" className="btn btn-light btn-block">
            🛡️ moderation queue
          </Link>
        )}

        <div className="space-y-2">
          <Button
            variant="light"
            className="btn-block"
            onClick={async () => {
              await signOut();
              router.replace("/");
            }}
          >
            sign out
          </Button>
          <Button variant="danger" className="btn-block" onClick={() => setDeleteSheet(true)}>
            delete my account
          </Button>
        </div>

        <p className="px-1 text-center text-xs text-muted">pap — post a plan. built for one city at a time.</p>
      </div>

      <Sheet
        open={deleteSheet}
        onClose={() => setDeleteSheet(false)}
        title="delete your account?"
        subtitle="your profile is scrubbed, upcoming plans you host are cancelled, and you're removed from everything you joined. this can't be undone."
        footer={
          <div className="flex gap-2">
            <Button variant="light" className="flex-1" onClick={() => setDeleteSheet(false)}>
              keep my account
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={confirmText !== "delete"}
              loading={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteAccount({ confirm: "delete" });
                  await signOut();
                  router.replace("/");
                } catch (e) {
                  toast(errorText(e), "bad");
                  setDeleting(false);
                }
              }}
            >
              delete
            </Button>
          </div>
        }
      >
        <Field label="type “delete” to confirm">
          <input className="field my-2" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </Field>
      </Sheet>
    </div>
  );
}

function ProfileForm({ me }: { me: Me }) {
  const toast = useToast();
  const updateProfile = useMutation(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const setAvatar = useMutation(api.users.setAvatar);
  const removeAvatar = useMutation(api.users.removeAvatar);

  const [name, setName] = useState(me.name ?? "");
  const [handle, setHandle] = useState(me.handle ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [emoji, setEmoji] = useState(me.emoji ?? "🙂");
  const [color, setColor] = useState(me.color ?? AVATAR_COLORS[0]);
  const [interests, setInterests] = useState<string[]>(me.interests ?? []);
  const [availability, setAvailability] = useState<string[]>(me.availability ?? []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const dirty =
    name !== (me.name ?? "") ||
    handle !== (me.handle ?? "") ||
    bio !== (me.bio ?? "") ||
    emoji !== (me.emoji ?? "🙂") ||
    color !== (me.color ?? AVATAR_COLORS[0]) ||
    interests.join() !== (me.interests ?? []).join() ||
    availability.join() !== (me.availability ?? []).join();

  async function save() {
    setBusy(true);
    try {
      await updateProfile({ name, handle, bio, emoji, color, interests, availability });
      toast("saved");
    } catch (e) {
      toast(errorText(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function upload(f: File) {
    if (!f.type.startsWith("image/")) return toast("that file isn't an image", "bad");
    if (f.size > 5_000_000) return toast("photos need to be under 5 MB", "bad");
    setUploading(true);
    try {
      const url = await generateUploadUrl({});
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": f.type }, body: f });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = await res.json();
      await setAvatar({ storageId });
      toast("photo updated");
    } catch (e) {
      toast(errorText(e), "bad");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <section className="card p-4">
        <p className="label mb-3">you</p>
        <div className="flex items-center gap-4">
          <Avatar user={{ name, emoji, color, image: me.image }} size={72} />
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="light" loading={uploading} onClick={() => file.current?.click()}>
              {me.image ? "change photo" : "add a photo"}
            </Button>
            {me.image && (
              <button className="text-xs font-bold text-muted underline" onClick={() => removeAvatar({}).then(() => toast("back to your emoji"))}>
                use my emoji instead
              </button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              aria-label="upload a profile photo"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-9 gap-1.5">
          {EMOJIS.map((x) => (
            <button
              key={x}
              onClick={() => setEmoji(x)}
              aria-label={`avatar ${x}`}
              aria-pressed={emoji === x}
              className={`grid aspect-square place-items-center rounded-xl bg-paper text-xl ${emoji === x ? "ring-2 ring-ink" : ""}`}
            >
              {x}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{ background: c }}
              aria-label={`colour ${c}`}
              aria-pressed={color === c}
              className={`size-8 rounded-full ${color === c ? "ring-2 ring-ink ring-offset-2" : ""}`}
            />
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <Field label="name">
            <input className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="handle" hint="people find you by this">
            <input className="field" value={handle} maxLength={20} onChange={(e) => setHandle(e.target.value.toLowerCase())} />
          </Field>
          <Field label="bio" hint={`${bio.length}/160`}>
            <textarea className="field min-h-[70px] resize-none" value={bio} maxLength={160} onChange={(e) => setBio(e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="card p-4">
        <p className="label mb-2">what you're into</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              on={interests.includes(c.key)}
              onClick={() => setInterests((v) => (v.includes(c.key) ? v.filter((x) => x !== c.key) : [...v, c.key]))}
            >
              <span>{c.emoji}</span> {c.label}
            </Chip>
          ))}
        </div>
        <p className="label mb-2 mt-4">usually free</p>
        <div className="flex flex-wrap gap-2">
          {AVAILABILITY.map((a) => (
            <Chip
              key={a.key}
              on={availability.includes(a.key)}
              onClick={() => setAvailability((v) => (v.includes(a.key) ? v.filter((x) => x !== a.key) : [...v, a.key]))}
            >
              <span>{a.emoji}</span> {a.label}
            </Chip>
          ))}
        </div>
      </section>

      <Button className="btn-block" loading={busy} disabled={!dirty} onClick={save}>
        {dirty ? "save profile" : "saved"}
      </Button>
    </>
  );
}

function LocationCard({ me }: { me: Me }) {
  const toast = useToast();
  const geo = useGeo();
  const updateSettings = useMutation(api.users.updateSettings);
  const updateLocation = useMutation(api.users.updateLocation);
  const [override, setOverride] = useState<number | null>(null);
  const radius = override ?? me.radiusKm ?? 10;

  return (
    <section className="card p-4">
      <p className="label mb-2">where you are</p>
      <p className="text-sm text-muted">
        home area: <span className="font-bold text-ink">{me.areaName ?? "not set"}</span>. we store this rounded to about a kilometre — never your exact
        position.
      </p>
      <Button
        size="sm"
        variant="light"
        className="mt-3"
        loading={geo.asking}
        onClick={async () => {
          try {
            const here = await geo.locate();
            if (!here) return;
            const area = await reverseArea(here.lat, here.lng);
            await updateLocation({ lat: here.lat, lng: here.lng, areaName: area || undefined });
            toast("home area updated");
          } catch (e) {
            toast(errorText(e), "bad");
          }
        }}
      >
        📍 update from my location
      </Button>
      {geo.denied && <p className="mt-2 text-xs text-muted">your browser is blocking location — you can still set your area during onboarding.</p>}
      <label className="label mb-2 mt-4 block" htmlFor="radius">
        how far you'll travel · {radius} km
      </label>
      <input
        id="radius"
        type="range"
        min={1}
        max={50}
        value={radius}
        onChange={(e) => setOverride(Number(e.target.value))}
        onPointerUp={() => updateSettings({ radiusKm: radius })}
        onKeyUp={() => updateSettings({ radiusKm: radius })}
        className="w-full accent-[#0b0d12]"
      />
    </section>
  );
}

function PrivacyCard({ me }: { me: Me }) {
  const toast = useToast();
  const updateSettings = useMutation(api.users.updateSettings);
  return (
    <section className="card px-4 py-2">
      <p className="label my-3">privacy & safety</p>
      <Field label="who can message you directly">
        <div className="flex flex-wrap gap-2">
          {[
            { v: "planned" as const, label: "people i've planned with" },
            { v: "friends" as const, label: "friends only" },
            { v: "none" as const, label: "nobody" },
          ].map((o) => (
            <Chip
              key={o.v}
              on={(me.dmPolicy ?? "planned") === o.v}
              onClick={() => updateSettings({ dmPolicy: o.v }).then(() => toast("updated"))}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="mt-2">
        <Toggle
          checked={me.showFreeToFriends !== false}
          onChange={(v) => updateSettings({ showFreeToFriends: v })}
          label="let friends see when i'm free"
          hint="only mutual friends, only while your timer is running. never strangers."
        />
        <Toggle
          checked={me.notifyFollowing !== false}
          onChange={(v) => updateSettings({ notifyFollowing: v })}
          label="tell me when people i follow post plans"
          hint="how you keep up with hosts and organisers you like."
        />
      </div>
    </section>
  );
}

function BlockedCard() {
  const blocked = useQuery(api.users.blockedList);
  const block = useMutation(api.users.block);
  const toast = useToast();
  return (
    <section className="card p-4">
      <p className="label mb-2">blocked</p>
      {blocked === undefined ? (
        <div className="skeleton h-8 w-full" />
      ) : blocked.length === 0 ? (
        <p className="text-sm text-muted">nobody. you can block anyone from their profile.</p>
      ) : (
        <div className="space-y-2">
          {blocked.map((b) => (
            <div key={b._id} className="flex items-center gap-3">
              <Avatar user={b} size={32} />
              <span className="flex-1 truncate text-sm font-bold">{b.name}</span>
              <button
                className="text-xs font-bold text-muted underline"
                onClick={() => block({ userId: b._id as Id<"users">, on: false }).then(() => toast(`${b.name} unblocked`))}
              >
                unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
