import type { ReactNode } from 'react';
import { motion } from 'motion/react';

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3"
    >
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1.5">{breadcrumb}</div>}
        <h1 className="truncate text-[22px] leading-tight font-semibold">{title}</h1>
        {description && (
          <p className="text-secondary mt-1.5 max-w-2xl text-[13.5px] leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}
