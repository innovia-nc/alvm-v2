/* @ds-bundle: {"format":4,"namespace":"AssoSaas","components":[{"name":"Button"},{"name":"Badge"},{"name":"Field"},{"name":"StatCard"},{"name":"DataTable"},{"name":"EmptyState"},{"name":"Sidebar"},{"name":"PageHeader"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;
  function cx() { return Array.prototype.slice.call(arguments).filter(Boolean).join(' '); }
  function omit(p, keys) { var o = {}; Object.keys(p).forEach(function (k) { if (keys.indexOf(k) < 0) o[k] = p[k]; }); return o; }

  var PATHS = {
    plus: 'M12 5v14M5 12h14',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
    chevronDown: 'M6 9l6 6 6-6',
    chevronRight: 'M9 6l6 6-6 6',
    arrowUpRight: 'M7 17L17 7M8 7h9v9',
    home: 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
    users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M17 4.5a3.5 3.5 0 0 1 0 6.5M18 14.2c2.2.6 4 2.4 4 5.8',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    tent: 'M3 20L12 4l9 16zM12 11l-3 9M12 11l3 9',
    receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
    card: 'M3 6h18v12H3zM3 10h18',
    edit: 'M4 20h4L19 9l-4-4L4 16z',
    trash: 'M5 7h14M10 4h4M7 7l1 13h8l1-13',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    file: 'M7 3h7l5 5v13H7zM14 3v5h5'
  };

  function Icon(p) {
    var s = p.size || 18;
    return h('svg', { className: cx('as-icon', p.className), width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: PATHS[p.name] || '' }));
  }

  function Button(p) {
    var rest = omit(p, ['variant', 'size', 'icon', 'children', 'className']);
    return h('button', Object.assign({ type: 'button', className: cx('as-btn', 'as-btn--' + (p.variant || 'primary'), p.size === 'sm' && 'as-btn--sm', p.className) }, rest),
      p.icon ? h(Icon, { name: p.icon, size: 16 }) : null, p.children);
  }

  function Badge(p) {
    return h('span', { className: cx('as-badge', 'as-badge--' + (p.tone || 'neutral'), p.className) },
      p.dot ? h('span', { className: 'as-badge__dot' }) : null, p.children);
  }

  function Input(p) {
    var rest = omit(p, ['invalid', 'className']);
    return h('input', Object.assign({ className: cx('as-input', p.invalid && 'is-invalid', p.className) }, rest));
  }

  function Select(p) {
    var rest = omit(p, ['options', 'className']);
    return h('span', { className: 'as-select' },
      h('select', Object.assign({ className: cx('as-select__control', p.className) }, rest),
        (p.options || []).map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); })),
      h(Icon, { name: 'chevronDown', size: 16, className: 'as-select__chev' }));
  }

  function Field(p) {
    return h('div', { className: cx('as-field', p.className) },
      p.label ? h('label', { className: 'as-field__label', htmlFor: p.htmlFor }, p.label, p.required ? h('span', { className: 'as-field__req', 'aria-hidden': true }, ' *') : null) : null,
      p.children,
      p.hint && !p.error ? h('p', { className: 'as-field__hint' }, p.hint) : null,
      p.error ? h('p', { className: 'as-field__error', role: 'alert' }, p.error) : null);
  }

  function SearchBar(p) {
    return h('div', { className: 'as-search' },
      h(Input, { placeholder: p.placeholder, 'aria-label': p.placeholder, defaultValue: p.defaultValue }),
      h(Button, { variant: 'secondary', icon: 'search' }, p.buttonLabel || 'Rechercher'));
  }

  function Card(p) {
    return h('div', { className: cx('as-card', p.padded !== false && 'as-card--pad', p.className) }, p.children);
  }

  function StatCard(p) {
    return h('div', { className: cx('as-card', 'as-stat', p.alert && 'as-stat--alert') },
      h('div', { className: 'as-stat__top' }, h('span', null, p.label), p.icon ? h(Icon, { name: p.icon, size: 18 }) : null),
      h('div', { className: 'as-stat__value' }, p.value, p.unit ? h('span', { className: 'as-stat__unit' }, p.unit) : null),
      h('a', { className: 'as-stat__foot', href: p.href || '#' }, h('span', null, p.caption), h(Icon, { name: 'arrowUpRight', size: 16 })));
  }

  function DataTable(p) {
    var cols = p.columns || [];
    return h('div', { className: 'as-card as-table-wrap' },
      h('table', { className: 'as-table' },
        h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { key: c.key, className: c.align === 'right' ? 'is-right' : undefined }, c.label); }))),
        h('tbody', null, (p.rows || []).map(function (r, i) {
          return h('tr', { key: r.id || i }, cols.map(function (c) {
            var cls = cx(c.align === 'right' && 'is-right', c.kind === 'code' && 'as-table__code', c.kind === 'amount' && 'as-table__amount', c.kind === 'strong' && 'as-table__strong');
            return h('td', { key: c.key, className: cls || undefined }, c.render ? c.render(r) : r[c.key]);
          }));
        }))),
      p.footer ? h('div', { className: 'as-table-foot' }, p.footer) : null);
  }

  function EmptyState(p) {
    return h('div', { className: 'as-card as-empty' },
      h('div', { className: 'as-empty__icon' }, h(Icon, { name: p.icon || 'search', size: 22 })),
      h('p', { className: 'as-empty__title' }, p.title),
      p.description ? h('p', { className: 'as-empty__text' }, p.description) : null,
      p.action || null);
  }

  function Sidebar(p) {
    return h('nav', { className: 'as-nav', 'aria-label': 'Navigation principale' },
      h('div', { className: 'as-nav__brand' }, p.brand),
      (p.groups || []).map(function (g, gi) {
        return h('div', { key: gi, className: 'as-nav__group' },
          g.label ? h('div', { className: 'as-nav__label' }, g.label) : null,
          g.items.map(function (it) {
            return h('a', { key: it.label, href: it.href || '#', className: 'as-nav__item', 'aria-current': it.active ? 'page' : undefined },
              it.icon ? h(Icon, { name: it.icon, size: 18 }) : null, it.label);
          }));
      }),
      p.footer ? h('div', { className: 'as-nav__foot' }, p.footer) : null);
  }

  function PageHeader(p) {
    var crumbs = p.breadcrumb || [];
    return h('header', { className: 'as-page' },
      h('div', null,
        crumbs.length ? h('div', { className: 'as-page__crumbs' }, h(Icon, { name: 'home', size: 14 }), crumbs.map(function (c, i) {
          var last = i === crumbs.length - 1;
          return h(React.Fragment, { key: i }, h(Icon, { name: 'chevronRight', size: 12 }), last ? h('b', null, c) : h('span', null, c));
        })) : null,
        h('h1', { className: 'as-page__title' }, p.title),
        p.subtitle ? h('p', { className: 'as-page__sub' }, p.subtitle) : null),
      p.action || null);
  }

  window.AssoSaas = { Icon: Icon, Button: Button, Badge: Badge, Input: Input, Select: Select, Field: Field, SearchBar: SearchBar, Card: Card, StatCard: StatCard, DataTable: DataTable, EmptyState: EmptyState, Sidebar: Sidebar, PageHeader: PageHeader };
})();
