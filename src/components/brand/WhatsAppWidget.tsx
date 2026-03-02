import { MessageCircle, Send, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export function WhatsAppWidget({
  whatsAppNumber,
  initialMessage = 'Hola 👋 ¿En qué podemos ayudarte?'
}: {
  whatsAppNumber: string;
  initialMessage?: string;
}) {
  const [open, setOpen] = useState(false);

  const chatUrl = useMemo(() => {
    const text = encodeURIComponent('Hola, necesito apoyo con el onboarding de Perfilab.');
    return `https://wa.me/${whatsAppNumber}?text=${text}`;
  }, [whatsAppNumber]);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div className="mb-3 w-[320px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft-dark" role="dialog" aria-label="Chat de WhatsApp">
          <div className="flex items-center justify-between bg-perfilabGreen px-4 py-3 text-white">
            <div className="flex items-center gap-2 font-semibold">
              <MessageCircle className="h-5 w-5" /> WhatsApp
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar chat" className="rounded-full p-1 hover:bg-black/10">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4 bg-[#0b1d13] p-4 text-white">
            <div className="max-w-[240px] rounded-3xl bg-white/20 px-4 py-3 text-base">
              <p>{initialMessage}</p>
            </div>
            <a
              href={chatUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-perfilabGreen px-4 py-3 text-base font-bold text-white transition hover:bg-[#1daa56]"
            >
              Abrir chat <Send className="h-5 w-5" />
            </a>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="ml-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-perfilabGreen text-white shadow-[0_12px_24px_rgba(37,211,102,0.45)] transition hover:scale-105"
        aria-label="Abrir soporte por WhatsApp"
      >
        <MessageCircle className="h-8 w-8" />
      </button>
    </div>
  );
}
