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
    : 'mb-[clamp(14px,0.8vw,18px)] gap-[clamp(12px,0.8vw,18px)]';
  const textClass = isDrawer ? 'text-sm' : 'text-[clamp(14px,0.72vw,18px)]';
  const titleClass = isDrawer ? 'text-sm' : 'text-[clamp(18px,0.88vw,22px)]';
  const composeHeightClass = isDrawer
    ? 'h-[46px]'
    : 'h-[clamp(58px,3.2vw,68px)]';

  return (
    <section
      className={`pointer-events-auto flex min-h-0 flex-col rounded-xl border border-border-muted/15 bg-surface-elevated/95 text-white/90 shadow-chat-panel backdrop-blur-sm ${
        isDrawer ? 'h-full p-3' : 'h-full p-[calc(clamp(18px,1vw,24px)+2px)]'
      }`}
      id={id}
    >
      <div className={`flex items-center justify-between ${headerClass}`}>
        <h2 className={`font-bold text-accent ${titleClass}`}>테이블 채팅</h2>
        {onClose && (
          <button
            aria-label="채팅 패널 닫기"
            className="min-h-11 rounded-md border border-white/20 px-3 text-sm font-bold text-white hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        )}
      </div>
      <div
        aria-live="polite"
        className={`flex min-h-0 flex-1 flex-col gap-[clamp(8px,0.65vw,13px)] overflow-y-auto px-[3px] pt-1 pb-2 ${
          isDrawer ? 'mb-3 text-sm' : 'mb-[clamp(12px,calc(6px+0.3125vw),16px)]'
        } ${textClass}`}
      >
        {chatMessages.map((message, index) => {
          const isSelf = message.sender === selfSeat;

          return (
            <div
              className={`flex w-full ${isSelf ? 'justify-end' : 'justify-start'}`}
              data-self={isSelf}
              key={`${message.sender}:${index}`}
            >
              <p
                className={`m-0 max-w-[82%] break-words border px-3.5 py-2.5 leading-[1.55] ${
                  isSelf
                    ? 'rounded-[14px_14px_4px_14px] border-transparent bg-linear-[145deg,var(--color-chat-bubble-top),var(--color-chat-bubble-bottom)] font-semibold text-chat-bubble-ink shadow-chat-self'
                    : 'rounded-[14px_14px_14px_4px] border-border-muted/20 bg-transparent text-chat-text shadow-chat-opponent'
                }`}
                data-self={isSelf}
              >
                {isSelf ? '나' : '상대'}: {message.text}
              </p>
            </div>
          );
        })}
      </div>
      <form
        className={`grid grid-cols-[1fr_auto] items-stretch ${composeHeightClass} ${
          isDrawer ? 'gap-2' : 'gap-[clamp(8px,calc(2px+0.3125vw),12px)]'
        }`}
        onSubmit={onChatSubmit}
      >
        <input
          aria-label="메시지"
          className={`m-0 h-full min-h-0 min-w-0 rounded-md border border-border-muted/15 bg-surface-input px-3 py-2 text-white outline-none placeholder:text-placeholder focus:border-accent ${textClass}`}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          placeholder="메시지를 입력하세요"
          onChange={(event) => onChatInputChange(event.target.value)}
          type="text"
          value={chatInput}
        />
        <button
          className={`m-0 h-full min-h-0 min-w-[clamp(96px,5vw,116px)] rounded-md border border-accent bg-accent px-[clamp(16px,calc(10px+0.3125vw),22px)] py-2 font-bold text-action-ink hover:enabled:border-accent-hover hover:enabled:bg-accent-hover disabled:opacity-40 ${textClass}`}
          disabled={!chatInput.trim()}
          type="submit"
        >
          전송
        </button>
      </form>
    </section>
  );
}
