import type {
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  TextareaHTMLAttributes
} from "react";
import { Checkbox } from "../coss/ui/checkbox";
import { Input, type InputProps } from "../coss/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue
} from "../coss/ui/select";
import { Textarea } from "../coss/ui/textarea";
import { cn } from "../coss/lib/utils";

export type SelectOption = {
  label: ReactNode;
  value: string;
};

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: InputProps["size"];
};

export function TextInput({ className, size, ...props }: TextInputProps) {
  return (
    <Input
      className={cn("ui-input", className)}
      nativeInput
      {...(size === undefined ? {} : { size })}
      {...props}
    />
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  size?: "sm" | "default" | "lg" | number;
};

export function TextArea({ className, size, ...props }: TextAreaProps) {
  return (
    <Textarea
      className={cn("ui-textarea", className)}
      {...(size === undefined ? {} : { size })}
      {...props}
    />
  );
}

export function SelectControl({
  className,
  disabled,
  onValueChange,
  options,
  placeholder = "Select...",
  size = "default",
  value
}: {
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  size?: "sm" | "default" | "lg";
  value: string;
}) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(nextValue) => {
        if (nextValue !== null) {
          onValueChange(nextValue);
        }
      }}
      value={value}
    >
      <SelectTrigger className={cn("ui-select", className)} size={size}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

export function CheckboxControl({
  checked,
  children,
  className,
  disabled,
  onCheckedChange
}: PropsWithChildren<{
  checked: boolean;
  className?: string;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}>) {
  return (
    <span className={cn("ui-checkbox-control", className)}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      {children ? <span className="ui-checkbox-control__label">{children}</span> : null}
    </span>
  );
}
