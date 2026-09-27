import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  autoComplete?: string;
}

export default function PasswordInput({ value, onChange, className, placeholder, autoFocus, required, autoComplete }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`${className || 'input-field'} !pr-9`}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        tabIndex={-1}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
