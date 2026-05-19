"use client";

import { useRef, useState } from "react";

import { signOut } from "@/app/(auth)/login/actions";
import { Icon } from "@/components/ui/icon";

/**
 * Avatar dropdown in the TopNav. Tapping the avatar reveals a small popover
 * with the user's email + a "Çıkış" action that submits the signOut form.
 */

type Props = {
  initial: string;
  email: string;
};

export function LogoutMenu({ initial, email }: Props) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Hesap menüsü — ${email}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-slate-900 ring-2 ring-white shadow-sm bg-gradient-to-br from-amber-400 to-amber-500 et-focus"
      >
        {initial}
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-40 w-60 et-glass-strong rounded-2xl p-2"
          >
            <div className="px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Oturum
              </div>
              <div className="mt-0.5 truncate text-sm text-slate-900">{email}</div>
            </div>
            <div className="h-px bg-slate-200/70 mx-2 my-1" />
            <form ref={formRef} action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 et-focus"
              >
                <Icon name="power" size={16} />
                Çıkış yap
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
