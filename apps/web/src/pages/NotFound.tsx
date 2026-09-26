import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="That screen doesn't exist, or it isn't available for your role."
      action={
        <Link to="/">
          <Button variant="primary">Back to dashboard</Button>
        </Link>
      }
    />
  );
}
