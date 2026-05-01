'use client';

import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { StructuredForm } from '../../lib/structuredResponse';

interface Props {
  form: StructuredForm;
  onSubmit: (description: string) => void;
  disabled?: boolean;
}

export default function IntakeForm({ form, onSubmit, disabled }: Props) {
  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of form.fields) {
      if (f.default !== undefined && f.default !== null) {
        out[f.id] = String(f.default);
      } else {
        out[f.id] = '';
      }
    }
    return out;
  }, [form]);

  const [values, setValues] = useState<Record<string, string>>(initial);

  const handleChange = (id: string, v: string) => {
    setValues((s) => ({ ...s, [id]: v }));
  };

  const handleSubmit = () => {
    if (disabled) return;
    const lines: string[] = ['Form answers:'];
    for (const f of form.fields) {
      const v = values[f.id];
      if (v === undefined || v === null || v === '') continue;
      lines.push(`- ${f.label}: ${v}`);
    }
    onSubmit(lines.join('\n'));
  };

  const inputBaseStyle: React.CSSProperties = {
    background: 'var(--studio-surface)',
    border: '1px solid var(--studio-border)',
    color: 'var(--studio-text)',
    fontSize: 11,
    padding: '6px 8px',
    borderRadius: 6,
    width: '100%',
    outline: 'none',
  };

  const focus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = 'var(--studio-accent)';
  };
  const blur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = 'var(--studio-border)';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="my-3"
      style={{ pointerEvents: disabled ? 'none' : 'auto', opacity: disabled ? 0.55 : 1 }}
    >
      <div
        className="leading-snug"
        style={{ color: 'var(--studio-text)', fontSize: 12.5, fontWeight: 600 }}
      >
        {form.title}
      </div>
      {form.intro && (
        <div
          className="mt-1 leading-snug"
          style={{ color: 'var(--studio-text-sec)', fontSize: 11 }}
        >
          {form.intro}
        </div>
      )}
      <motion.div
        className="mt-2 flex flex-col gap-2"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
        }}
      >
        {form.fields.map((f) => (
          <motion.div
            key={f.id}
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: { opacity: 1, y: 0 },
            }}
            className="flex flex-col gap-1"
          >
            <label
              htmlFor={`field-${f.id}`}
              style={{ color: 'var(--studio-text-sec)', fontSize: 11, fontWeight: 500 }}
            >
              {f.label}
            </label>
            {f.type === 'select' ? (
              <select
                id={`field-${f.id}`}
                value={values[f.id] ?? ''}
                onChange={(e) => handleChange(f.id, e.target.value)}
                onFocus={focus}
                onBlur={blur}
                disabled={disabled}
                style={inputBaseStyle}
              >
                {!values[f.id] && <option value="" />}
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`field-${f.id}`}
                type={f.type === 'number' ? 'number' : 'text'}
                value={values[f.id] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => handleChange(f.id, e.target.value)}
                onFocus={focus}
                onBlur={blur}
                disabled={disabled}
                style={inputBaseStyle}
              />
            )}
          </motion.div>
        ))}
      </motion.div>
      <motion.button
        type="button"
        onClick={handleSubmit}
        disabled={disabled}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        className="mt-3 rounded-md px-3 py-1.5 transition-colors"
        style={{
          background: 'var(--studio-accent)',
          color: '#ffffff',
          border: '1px solid var(--studio-accent)',
          fontSize: 11.5,
          fontWeight: 600,
          borderRadius: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {form.submit_label || 'Continue'}
      </motion.button>
    </motion.div>
  );
}
