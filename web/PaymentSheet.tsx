import { useEffect, useRef, useState } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import { money, totalAmount, type PaymentView } from '../shared/contracts.js';
import { invoke, latestPayment } from './bridge.js';

function Icon({
  name,
  className = '',
}: {
  name: 'lock' | 'bag' | 'wallet' | 'close' | 'arrow' | 'check';
  className?: string;
}) {
  const paths = {
    lock: (
      <>
        <rect x="6" y="10" width="12" height="10" rx="3" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3M12 14v2" />
      </>
    ),
    bag: (
      <>
        <path d="M5 8h14l1 12H4L5 8Z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="4" />
        <path d="M3 9h18M16 13h5v4h-5a2 2 0 0 1 0-4Z" />
      </>
    ),
    close: <path d="m7 7 10 10M17 7 7 17" />,
    arrow: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function DemoDialog({
  view,
  onFinish,
  onCancel,
}: {
  view: PaymentView;
  onFinish: (outcome: 'success' | 'declined') => Promise<void>;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const complete = async (outcome: 'success' | 'declined') => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onFinish(outcome);
    } catch {
      setError('The demo could not finish. Try again.');
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="demo-dialog"
      aria-labelledby="demo-title"
      aria-describedby="demo-description"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="dialog-handle" />
      <div className="sheet-header">
        <span className="brand">
          <span className="brand-mark">L</span> Lucci Pay
        </span>
        <button
          className="icon-button"
          aria-label="Close demo payment"
          onClick={onCancel}
          disabled={busy}
        >
          <Icon name="close" />
        </button>
      </div>
      <span className="eyebrow">DEMO PAYMENT SHEET</span>
      <h2 id="demo-title">Confirm demo payment</h2>
      <p id="demo-description" className="muted">
        No money moves. No card is needed.
      </p>
      <div className="demo-method">
        <span className="card-symbol">
          <Icon name="wallet" />
        </span>
        <div>
          <strong>Demo payment method</strong>
          <span>For preview only</span>
        </div>
      </div>
      <div className="dialog-total">
        <span>{view.merchant.name}</span>
        <strong>{money(totalAmount(view.session), view.session.currency)}</strong>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy} onClick={() => void complete('success')}>
        {busy ? (
          <>
            <span className="spinner" />
            Confirming…
          </>
        ) : (
          'Confirm demo payment'
        )}
      </button>
      <button className="text-button" disabled={busy} onClick={() => void complete('declined')}>
        Preview a declined payment
      </button>
    </dialog>
  );
}

export function PaymentSheet({
  initial,
  app,
  onNewDemo,
}: {
  initial: PaymentView;
  app: App | null;
  onNewDemo?: () => void;
}) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showDemo, setShowDemo] = useState(false);
  const [now, setNow] = useState(Date.now());
  const paying = useRef(false);
  const mounted = useRef(true);
  const activeRequest = useRef(initial.request_id);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    activeRequest.current = initial.request_id;
    setView((current) => latestPayment(current, initial));
    setError('');
    setNotice('');
  }, [initial]);
  useEffect(() => {
    const timeout = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Date.parse(view.expires_at) - Date.now()) + 50,
    );
    return () => clearTimeout(timeout);
  }, [view.expires_at]);
  useEffect(() => {
    if (view.status === 'paid') receiptHeading.current?.focus();
  }, [view.status]);

  const update = (next: PaymentView) => {
    if (mounted.current && next.request_id === activeRequest.current)
      setView((current) => latestPayment(current, next));
  };
  const refresh = async () => {
    const next = await invoke(app, 'get_payment_status', view.request_id);
    update(next);
    return next;
  };
  useEffect(() => {
    if (view.status !== 'processing') return;
    let stopped = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await invoke(app, 'get_payment_status', view.request_id);
        if (!stopped) update(next);
        if (next.status !== 'processing') return;
      } catch {
        /* Leave a manual check available if connectivity is lost. */
      }
      if (!stopped && ++polls < 20) timer = setTimeout(() => void poll(), 2000);
    };
    timer = setTimeout(() => void poll(), 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [view.request_id, view.status, app]);

  const demo = view.mode === 'demo';
  const expired =
    view.status === 'expired' ||
    (['pending', 'failed'].includes(view.status) && now >= Date.parse(view.expires_at));
  const native = Boolean(view.checkout_enabled && window.openai?.requestCheckout);
  const total = money(totalAmount(view.session), view.session.currency);
  const payable = ['pending', 'failed'].includes(view.status) && !expired && (demo || native);
  const dismissDemo = () => {
    setShowDemo(false);
    setNotice('Payment cancelled. You have not been charged.');
    dismissRef.current?.focus();
  };

  const pay = async () => {
    if (paying.current || !payable) return;
    if (demo) {
      setShowDemo(true);
      return;
    }
    paying.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      // Called directly from the user gesture. The host owns Apple Pay, card
      // entry, biometrics and 3DS. Never render a substitute credential form.
      await window.openai!.requestCheckout!(view.session);
      const next = await refresh();
      if (next.status !== 'paid')
        setNotice('Your payment is being confirmed. Check its status before trying again.');
    } catch {
      try {
        const next = await refresh();
        if (next.status === 'failed')
          setError('Payment wasn’t completed. You can choose another payment method.');
        else if (next.status === 'pending')
          setNotice('Payment sheet closed. You have not been charged.');
        else if (next.status !== 'paid')
          setNotice('We’re checking your payment. Please don’t start another request.');
      } catch {
        setError('We couldn’t confirm the payment status. Check again before retrying.');
      }
    } finally {
      paying.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const cancel = async () => {
    if (busy || paying.current) return;
    setBusy(true);
    setError('');
    try {
      update(await invoke(app, 'cancel_payment_request', view.request_id));
    } catch {
      setError('This request could not be cancelled. Check its payment status.');
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await refresh();
    } catch {
      setError('Couldn’t check the payment. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const paid = view.status === 'paid' && view.receipt;
  return (
    <article className="payment-sheet" aria-label="Lucci Pay payment request" aria-busy={busy}>
      <header className="sheet-header">
        <span className="brand">
          <span className="brand-mark">L</span> Lucci Pay
        </span>
        <span className={`mode ${view.mode}`}>
          {demo ? (
            'Demo'
          ) : view.mode === 'test' ? (
            'Test payment'
          ) : (
            <>
              <Icon name="lock" />
              Secure payment
            </>
          )}
        </span>
      </header>
      {paid ? (
        <div className="receipt-panel">
          <div className="success-circle">
            <Icon name="check" />
          </div>
          <h1 ref={receiptHeading} tabIndex={-1}>
            {demo
              ? 'Demo complete'
              : view.mode === 'test'
                ? 'Test payment complete'
                : 'Payment complete'}
          </h1>
          <p className="muted">
            {view.mode !== 'live'
              ? 'No money was charged.'
              : `Your payment to ${view.merchant.name} is confirmed.`}
          </p>
          <div className="receipt-amount">{total}</div>
          <p className="receipt-merchant">{view.merchant.name}</p>
          <dl className="receipt-details">
            <div>
              <dt>Status</dt>
              <dd>{demo ? 'Simulated' : view.mode === 'test' ? 'Test payment' : 'Paid'}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{view.receipt!.id.slice(-12).toUpperCase()}</dd>
            </div>
          </dl>
          {onNewDemo ? (
            <button className="primary" onClick={onNewDemo}>
              Try another demo
            </button>
          ) : window.openai?.requestClose ? (
            <button className="primary" onClick={() => window.openai?.requestClose?.()}>
              Done
            </button>
          ) : (
            <p className="footnote">You can continue your conversation.</p>
          )}
        </div>
      ) : view.status === 'cancelled' || expired ? (
        <div className="closed-panel">
          <span className="closed-icon">
            <Icon name={expired ? 'lock' : 'close'} />
          </span>
          <h1>{expired ? 'Request expired' : 'Request cancelled'}</h1>
          <p className="muted">
            {expired
              ? 'Ask the requesting app for a new payment request.'
              : 'You have not been charged.'}
          </p>
          {onNewDemo && (
            <button className="primary" onClick={onNewDemo}>
              Start a new demo
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="merchant-hero">
            <div className="merchant-monogram" aria-hidden="true">
              {view.merchant.name.charAt(0)}
            </div>
            <p className="eyebrow">PAYMENT REQUEST</p>
            <h1>{view.merchant.name}</h1>
            <p className="merchant-domain">{view.merchant.domain}</p>
            <div className="amount">
              {total}
              <span>{view.session.currency}</span>
            </div>
          </div>
          <div className="details-group">
            {view.session.line_items.map((item) => (
              <div className="item-row" key={item.id}>
                <div className="item-icon">
                  <Icon name="bag" />
                </div>
                <div className="item-description">
                  <strong>{item.name}</strong>
                  <span>Qty {item.item.quantity}</span>
                </div>
                <span className="item-price">{money(item.subtotal, view.session.currency)}</span>
              </div>
            ))}
            {view.session.totals
              .filter((t) => t.type === 'tax' && t.amount > 0)
              .map((t) => (
                <div className="detail-row" key={t.type}>
                  <span>{t.display_text}</span>
                  <span>{money(t.amount, view.session.currency)}</span>
                </div>
              ))}
            {view.session.line_items.some((i) => i.discount > 0) && (
              <div className="detail-row">
                <span>Discount included</span>
                <span>
                  −
                  {money(
                    view.session.line_items.reduce((n, i) => n + i.discount, 0),
                    view.session.currency,
                  )}
                </span>
              </div>
            )}
            <div className="detail-row total-row">
              <strong>Total due</strong>
              <strong>{total}</strong>
            </div>
          </div>
          <div className="fulfillment">
            <Icon name="bag" />
            <div>
              <strong>{view.session.fulfillment_options[0]?.title}</strong>
              <span>{view.session.fulfillment_options[0]?.subtitle}</span>
            </div>
          </div>
          <div className="method-row">
            <span className="wallet-icon">
              <Icon name="wallet" />
            </span>
            <div>
              <strong>{demo ? 'Try the payment experience' : 'Apple Pay & cards'}</strong>
              <span>
                {demo ? 'A preview. No money moves.' : 'Choose in the secure payment sheet'}
              </span>
            </div>
            {!demo && <Icon name="arrow" className="chevron" />}
          </div>
          <div className="message-area" aria-live="polite" aria-atomic="true">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {notice && <p className="notice">{notice}</p>}
            {view.status === 'processing' && (
              <p className="notice">Your payment is being confirmed. Please don’t pay again.</p>
            )}
            {!demo && !native && view.status !== 'processing' && (
              <p className="notice">In-chat payments aren’t available for this request yet.</p>
            )}
            {view.status === 'failed' && !error && (
              <p className="error">Payment declined. You can try again.</p>
            )}
          </div>
          {view.status === 'processing' ? (
            <button className="primary" disabled={busy} onClick={() => void check()}>
              {busy ? (
                <>
                  <span className="spinner" />
                  Checking…
                </>
              ) : (
                'Check payment status'
              )}
            </button>
          ) : (
            <button
              ref={dismissRef}
              className="primary"
              onClick={() => void pay()}
              disabled={!payable || busy}
            >
              {busy ? (
                <>
                  <span className="spinner" />
                  Opening payment sheet…
                </>
              ) : demo ? (
                <>
                  <Icon name="wallet" />
                  Try demo payment
                </>
              ) : native ? (
                <>
                  <Icon name="lock" />
                  Pay {total}
                </>
              ) : (
                'Payment unavailable'
              )}
            </button>
          )}
          {error && view.status !== 'processing' && (
            <button className="text-button" onClick={() => void check()} disabled={busy}>
              Check payment status
            </button>
          )}
          <button
            className="text-button"
            onClick={() => void cancel()}
            disabled={busy || view.status === 'processing'}
          >
            Cancel request
          </button>
          <footer className="payment-footer">
            <Icon name="lock" />
            <span>
              {demo
                ? 'Preview only · no payment details collected'
                : 'Your payment details stay in the payment sheet'}
            </span>
          </footer>
          {!demo && (
            <nav className="legal" aria-label="Merchant policies">
              {view.session.links.map((link) => (
                <a key={link.type} href={link.url} target="_blank" rel="noopener noreferrer">
                  {{
                    terms_of_use: 'Terms',
                    privacy_policy: 'Privacy',
                    refund_policy: 'Refunds',
                    support_url: 'Support',
                  }[link.type] ?? link.type}
                </a>
              ))}
            </nav>
          )}
        </>
      )}
      {showDemo && (
        <DemoDialog
          view={view}
          onCancel={dismissDemo}
          onFinish={async (outcome) => {
            const next = await invoke(app, 'simulate_payment', view.request_id, outcome);
            update(next);
            setShowDemo(false);
            setNotice('');
            setError(
              outcome === 'declined'
                ? 'Demo declined. No money was charged. Try again when you’re ready.'
                : '',
            );
          }}
        />
      )}
    </article>
  );
}
