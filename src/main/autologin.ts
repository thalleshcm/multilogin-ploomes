/**
 * Scripts injetados na página para preencher e enviar o login do Ploomes.
 *
 * Não dependem de seletores exatos: procuram um campo de senha visível e o
 * campo de e-mail/usuário imediatamente anterior a ele.
 */

const HELPERS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const findPassword = () =>
    Array.from(document.querySelectorAll('input[type="password"]')).find(visible);
`

/** Retorna 'form' se há um formulário de login visível com senha vazia, senão 'none'. */
export const CHECK_LOGIN_FORM_SCRIPT = `(() => {
  ${HELPERS}
  const pwd = findPassword();
  return pwd && !pwd.value ? 'form' : 'none';
})()`

/**
 * Preenche e envia. Se o formulário tiver um desafio Turnstile da Cloudflare
 * ainda não resolvido, espera (até ~2 min) que o usuário o confirme.
 *
 * Retorna 'submitted' | 'no-form' | 'waiting-challenge'.
 */
export function buildAutoLoginScript(email: string, password: string): string {
  return `(async () => {
    ${HELPERS}
    const EMAIL = ${JSON.stringify(email)};
    const PASSWORD = ${JSON.stringify(password)};
    const setValue = (el, value) => {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      el.focus();
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    const findEmail = (pwd) => {
      const scope = pwd.form || document;
      const inputs = Array.from(
        scope.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])')
      ).filter(visible);
      const preferred = inputs.find((i) =>
        /mail|user|login|usuario|usuário/i.test(
          [i.type, i.name, i.id, i.autocomplete, i.placeholder].join(' ')
        )
      );
      if (preferred) return preferred;
      const before = inputs.filter(
        (i) => i.compareDocumentPosition(pwd) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      return before[before.length - 1] || inputs[0];
    };
    const findSubmit = (pwd) => {
      const scope = pwd.form || document;
      const buttons = Array.from(
        scope.querySelectorAll('button, input[type="submit"], [role="button"]')
      ).filter(visible);
      return (
        buttons.find((b) => b.type === 'submit') ||
        buttons.find((b) => /entrar|login|acessar|sign in|continuar/i.test(b.innerText || b.value || '')) ||
        buttons[0]
      );
    };
    const challengePending = () => {
      const t = document.querySelector('[name="cf-turnstile-response"]');
      return !!t && !t.value;
    };

    const pwd = findPassword();
    if (!pwd) return 'no-form';

    const emailInput = findEmail(pwd);
    if (emailInput) setValue(emailInput, EMAIL);
    setValue(pwd, PASSWORD);

    // Aguarda o usuário confirmar o desafio da Cloudflare, se houver.
    for (let i = 0; i < 480 && challengePending(); i++) await sleep(250);
    if (challengePending()) return 'waiting-challenge';
    await sleep(300);

    const current = findPassword();
    if (!current) return 'no-form';
    const submit = findSubmit(current);
    if (submit) submit.click();
    else if (current.form) current.form.requestSubmit ? current.form.requestSubmit() : current.form.submit();
    else current.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    return 'submitted';
  })()`
}
