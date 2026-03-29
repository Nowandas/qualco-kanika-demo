import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type SelectOption = {
  value: string;
  label: React.ReactNode;
};

type SelectContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext() {
  return React.useContext(SelectContext);
}

type SelectProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
};

function flattenChildren(nodes: React.ReactNode): React.ReactElement[] {
  const out: React.ReactElement[] = [];

  React.Children.forEach(nodes, (child) => {
    if (!React.isValidElement(child)) return;
    out.push(child);
    const props = (child as React.ReactElement<any>).props;
    if (props?.children) {
      out.push(...flattenChildren(props.children));
    }
  });

  return out;
}

function extractOptions(children: React.ReactNode): SelectOption[] {
  const nodes = flattenChildren(children);
  const options: SelectOption[] = [];

  nodes.forEach((node) => {
    const props = (node as React.ReactElement<any>).props;
    if ((node.type as any)?.displayName === "SelectItem") {
      const value = String(props.value ?? "");
      if (!value) return;
      options.push({ value, label: props.children });
    }
  });

  return options;
}

function extractPlaceholder(children: React.ReactNode): string | undefined {
  const nodes = flattenChildren(children);
  for (const node of nodes) {
    const props = (node as React.ReactElement<any>).props;
    if ((node.type as any)?.displayName === "SelectValue" && typeof props.placeholder === "string") {
      return props.placeholder;
    }
  }
  return undefined;
}

function extractTriggerClassName(children: React.ReactNode): string | undefined {
  const nodes = flattenChildren(children);
  for (const node of nodes) {
    const props = (node as React.ReactElement<any>).props;
    if ((node.type as any)?.displayName === "SelectTrigger" && typeof props.className === "string") {
      return props.className;
    }
  }
  return undefined;
}

function nodeToText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((item) => nodeToText(item)).join(" ");
  }

  if (React.isValidElement(node)) {
    return nodeToText((node as React.ReactElement<any>).props?.children);
  }

  return "";
}

export function Select({ value, onValueChange, disabled, children }: SelectProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [dropdownStyle, setDropdownStyle] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const options = React.useMemo(() => extractOptions(children), [children]);
  const placeholder = React.useMemo(() => extractPlaceholder(children), [children]);
  const triggerClassName = React.useMemo(() => extractTriggerClassName(children), [children]);
  const selected = React.useMemo(() => options.find((option) => option.value === value), [options, value]);

  const updateDropdownPosition = React.useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 6;
    const margin = 8;

    const width = Math.min(rect.width, viewportWidth - margin * 2);
    const left = Math.min(Math.max(margin, rect.left), viewportWidth - width - margin);

    const spaceBelow = viewportHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openUpward = spaceBelow < 170 && spaceAbove > spaceBelow;
    const availableHeight = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(140, Math.min(300, availableHeight));

    const top = openUpward ? Math.max(margin, rect.top - gap - maxHeight) : Math.max(margin, rect.bottom + gap);

    setDropdownStyle({ top, left, width, maxHeight });
  }, []);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedRoot = !!rootRef.current?.contains(target);
      const clickedPanel = !!panelRef.current?.contains(target);
      if (!clickedRoot && !clickedPanel) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  React.useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  React.useEffect(() => {
    if (!open) return;
    updateDropdownPosition();
    setSearch("");
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [open, updateDropdownPosition]);

  React.useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [open, updateDropdownPosition]);

  const filteredOptions = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => {
      const labelText = nodeToText(option.label).toLowerCase();
      return labelText.includes(query) || option.value.toLowerCase().includes(query);
    });
  }, [options, search]);

  return (
    <SelectContext.Provider value={{ value, onValueChange, disabled }}>
      <div ref={rootRef} className="relative w-full">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-full border border-input bg-input/40 px-3 py-1 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
            triggerClassName,
          )}
          onClick={() => {
            if (disabled) return;
            setOpen((current) => !current);
          }}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : (placeholder ?? "Select option")}
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>

        {open && dropdownStyle
          ? createPortal(
              <div
                ref={panelRef}
                className="z-[320] overflow-auto rounded-xl border border-border bg-popover p-1 shadow-xl"
                style={{
                  position: "fixed",
                  top: dropdownStyle.top,
                  left: dropdownStyle.left,
                  width: dropdownStyle.width,
                  maxHeight: dropdownStyle.maxHeight,
                }}
              >
                <div className="sticky top-0 z-10 bg-popover p-1 pb-2">
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search..."
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>

                {filteredOptions.length === 0 ? (
                  <div className="px-2 py-2 text-sm text-muted-foreground">No results found.</div>
                ) : null}

                {filteredOptions.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/80",
                      )}
                      onClick={() => {
                        onValueChange?.(option.value);
                        setSearch("");
                        setOpen(false);
                      }}
                    >
                      <span className="truncate text-left">{option.label}</span>
                      {isSelected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                    </button>
                  );
                })}
              </div>,
              document.body,
            )
          : null}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ children }: { children?: React.ReactNode; className?: string }) {
  return <>{children}</>;
}
SelectTrigger.displayName = "SelectTrigger";

export function SelectContent({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
SelectContent.displayName = "SelectContent";

export function SelectItem({ children }: { value: string; children: React.ReactNode }) {
  return <>{children}</>;
}
SelectItem.displayName = "SelectItem";

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const context = useSelectContext();
  if (!context?.value) {
    return <>{placeholder}</>;
  }
  return null;
}
SelectValue.displayName = "SelectValue";
