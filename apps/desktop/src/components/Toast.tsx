import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';

type ToastItem = { id: number; message: string };
const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

let nextId = 1;

// Bottom-right, 4 s, stacks to 3 (DESIGN.md §6).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string) => {
    const id = nextId++;
    setItems((cur) => [...cur, { id, message }].slice(-3));
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed right-4 bottom-4 z-50 flex flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="rounded-md border border-line-strong bg-bg-2 px-4 py-2 shadow-[0_8px_32px_#00000080]"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
