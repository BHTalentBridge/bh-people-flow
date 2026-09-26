import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { extractMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(extractMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — hidden on small screens where the form is what matters. */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex"
        style={{ background: 'var(--nav-bg)' }}
      >
        <div className="absolute -top-28 -left-28 h-96 w-96 rounded-full bg-brand-600/18 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="bg-brand-600 flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white">
            SH
          </div>
          <div>
            <p className="font-semibold text-white">PeopleFlow</p>
            <p className="text-[11px]" style={{ color: 'var(--nav-text)' }}>
              Project → Module → Resource
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          className="relative max-w-md"
        >
          <h1 className="text-[30px] leading-[1.2] font-semibold text-white">
            Everything your delivery org runs on, in one place.
          </h1>
          <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: 'var(--nav-text)' }}>
            Projects and modules, internal and serviceProvider resources, attendance and overtime,
            ticket-linked tasks, and monthly invoicing — each scoped to the person looking at it.
          </p>

          <div className="mt-9 grid grid-cols-3 gap-3">
            {[
              ['Attendance', 'One-tap check in/out'],
              ['Overtime', 'Approved before logged'],
              ['Invoicing', 'Draft → Submit → Approve'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <p className="text-[12.5px] font-semibold text-white">{t}</p>
                <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--nav-text)' }}>
                  {d}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="relative text-[11.5px]" style={{ color: 'var(--nav-text)' }}>
          Steel Horizon — Human Resource Management System
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-5 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[380px]"
        >
          <div className="mb-8 lg:hidden">
            <div className="bg-brand-600 mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white">
              SH
            </div>
          </div>

          <h2 className="text-[22px] font-semibold">Sign in</h2>
          <p className="text-secondary mt-1.5 text-[13.5px]">
            Use your Steel Horizon account to continue.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-red-500/8 px-3 py-2.5 text-[13px] text-red-600 dark:text-red-400"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full justify-center">
              {!busy && (
                <>
                  Sign in <ArrowRight className="h-4 w-4" />
                </>
              )}
              {busy && 'Signing in…'}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
