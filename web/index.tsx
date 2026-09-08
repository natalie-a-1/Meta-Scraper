import { App } from '@modelcontextprotocol/ext-apps';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { PaymentView } from '../shared/contracts.js';
import { extractPayment } from './bridge.js';
import { PaymentSheet } from './PaymentSheet.js';
import './styles.css';

function EmbeddedPayment() {
  const [payment, setPayment] = useState<PaymentView>();
  const [app, setApp] = useState<App | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const bridge = new App({ name: 'Lucci Pay', version: '0.1.0' }, {});
    let disposed = false;
    bridge.ontoolresult = (result) => {
      const next = extractPayment(result);
      if (!disposed && next) setPayment(next);
    };
    bridge.onhostcontextchanged = (context) => {
      if (context.theme) document.documentElement.dataset.theme = context.theme;
    };
    void bridge
      .connect()
      .then(() => {
        if (disposed) return;
        setApp(bridge);
        const theme = bridge.getHostContext()?.theme;
        if (theme) document.documentElement.dataset.theme = theme;
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      void bridge.close();
    };
  }, []);
  if (error)
    return (
      <div className="empty-state" role="alert">
        The payment request couldn’t connect. Open it again to retry.
      </div>
    );
  if (!payment)
    return (
      <div className="empty-state" role="status">
        <span className="spinner" />
        Opening payment request…
      </div>
    );
  return <PaymentSheet key={payment.request_id} initial={payment} app={app} />;
}

function Preview() {
  const [payment, setPayment] = useState<PaymentView>();
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    try {
      const result = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const next = extractPayment(await result.json());
      if (!result.ok || !next) throw new Error();
      setPayment(next);
    } catch {
      setError('Couldn’t open the preview. Try again.');
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <main className="preview-page">
      <header className="preview-header">
        <span className="preview-wordmark">
          lucci<span>pay</span>
        </span>
        <span className="preview-label">INTERACTIVE PREVIEW</span>
      </header>
      <div className="preview-intro">
        <span className="eyebrow">PAYMENTS, IN THE CONVERSATION</span>
        <h2>
          A little less between
          <br />
          yes and done.
        </h2>
        <p>Review. Confirm. Keep going.</p>
      </div>
      {payment ? (
        <PaymentSheet
          key={payment.request_id}
          initial={payment}
          app={null}
          onNewDemo={() => void load()}
        />
      ) : (
        <div className="empty-state" role="status">
          {error || 'Opening the preview…'}
        </div>
      )}
      {error && (
        <button className="text-button" onClick={() => void load()}>
          Retry preview
        </button>
      )}
      <p className="preview-caption">
        An independent Lucci project. Demo payments do not move money.
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  window.parent === window ? <Preview /> : <EmbeddedPayment />,
);
