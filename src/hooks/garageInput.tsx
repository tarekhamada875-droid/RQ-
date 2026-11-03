import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface GarageInputContextValue {
  plateInputRef: React.RefObject<HTMLInputElement>;
  inputRef: React.RefObject<HTMLDivElement>;
  isInputFocused: boolean;
  setIsInputFocused: (focused: boolean) => void;
  closeKeyboard: () => void;
}

const GarageInputContext = createContext<GarageInputContextValue | null>(null);

export function GarageInputProvider({ children }: { children: ReactNode }) {
  const plateInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const closeKeyboard = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsInputFocused(false);
  }, []);

  return (
    <GarageInputContext.Provider value={{
      plateInputRef,
      inputRef,
      isInputFocused,
      setIsInputFocused,
      closeKeyboard,
    }}>
      {children}
    </GarageInputContext.Provider>
  );
}

export function useGarageInput(): GarageInputContextValue {
  const ctx = useContext(GarageInputContext);
  if (!ctx) throw new Error('useGarageInput must be used within GarageInputProvider');
  return ctx;
}
