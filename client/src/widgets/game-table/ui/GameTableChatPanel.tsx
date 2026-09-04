import type { ChatMessagePayload, PlayerSeat } from '@blackjack/shared';
import { CHAT_MESSAGE_MAX_LENGTH } from '@blackjack/shared';
import type { FormEvent } from 'react';

interface GameTableChatPanelProps {
  chatInput: string;
  chatMessages: ChatMessagePayload[];
  id: string;
  onChatInputChange: (value: string) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose?: () => void;
  selfSeat: PlayerSeat;
  variant: 'wide' | 'drawer';
}

export function GameTableChatPanel({
  chatInput,
  chatMessages,
  id,
  onChatInputChange,
  onChatSubmit,
  onClose,
  selfSeat,
  variant,
}: GameTableChatPanelProps) {
  const isDrawer = variant === 'drawer';
  const headerClass = isDrawer
    ? 'mb-2 gap-3'
    : 'mb-[clamp(8px,calc(2px+0.3125vw),12px)] gap-[clamp(12px,calc(6px+0.3125vw),16px)]';
  const textClass = isDrawer
    ? 'text-sm'
    : 'text-[clamp(14px,calc(8px+0.3125vw),19px)]';
  const controlClass = isDrawer
    ? 'min-h-11 text-sm'
    : 'min-h-[clamp(44px,calc(20px+1.25vw),56px)] text-[clamp(14px,calc(8px+0.3125vw),19px)]';

  return (
    <section
      className={`pointer-events-auto flex min-h-0 flex-col rounded-xl border border-white/15 bg-slate-950/90 text-white/90 shadow-2xl backdrop-blur-sm ${
        isDrawer
          ? 'h-full p-3'
          : 'h-full p-[clamp(16px,calc(10px+0.3125vw),22px)]'
      }`}
      id={id}
    >
      <div className={`flex items-center justify-between ${headerClass}`}>
        <h2 className={`font-bold ${textClass}`}>Chat</h2>
        {onClose && (
          <button
            aria-label="채팅 패널 닫기"
            className="min-h-11 rounded-md border border-white/20 px-3 text-sm font-bold text-white"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        )}
      </div>
      <div
        aria-live="polite"
        className={`min-h-0 flex-1 overflow-y-auto ${
          isDrawer
            ? 'mb-3 space-y-1 text-sm'
            : 'mb-[clamp(12px,calc(6px+0.3125vw),16px)] space-y-[clamp(4px,calc(1px+0.15625vw),7px)]'
        } ${textClass}`}
      >
        {chatMessages.map((message, index) => (
          <p className="break-words" key={`${message.sender}:${index}`}>
            {message.sender === selfSeat ? 'Self' : 'Opponent'}: {message.text}
          </p>
        ))}
      </div>
      <form
        className={`grid grid-cols-[1fr_auto] ${
          isDrawer ? 'gap-2' : 'gap-[clamp(8px,calc(2px+0.3125vw),12px)]'
        }`}
        onSubmit={onChatSubmit}
      >
        <input
          aria-label="메시지"
          className={`min-w-0 rounded-md border border-white/15 bg-slate-900/75 px-3 py-2 text-white outline-none focus:border-blue-400 ${controlClass}`}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          onChange={(event) => onChatInputChange(event.target.value)}
          type="text"
          value={chatInput}
        />
        <button
          className={`rounded-md bg-blue-600 px-[clamp(16px,calc(10px+0.3125vw),22px)] py-2 font-bold text-white ${controlClass}`}
          type="submit"
        >
          전송
        </button>
      </form>
    </section>
  );
}
