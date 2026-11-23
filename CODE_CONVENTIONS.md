# Code Conventions

These conventions follow the official [Rules of React](https://react.dev/reference/rules). They are **rules, not guidelines**: code that breaks them is likely to have bugs, and must not be merged.

Examples use TypeScript and follow this project's compiler settings (see `CLAUDE.md`): `import type` for type-only imports, no `enum`/`namespace`, and `.tsx`/`.ts` extensions on local imports.

## Enforcement

| Mechanism                             | What it catches                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `<StrictMode>` in `src/main.tsx`      | Double-invokes render, Effects and some initializers in development to surface impure code. Never remove it. |
| Oxlint `react/rules-of-hooks` (error) | Hooks called conditionally, in loops, or outside components/hooks.                                           |
| Code review                           | Everything else in this document (purity, mutation, calling components directly). Lint does not catch these. |

Run `npm run lint` before pushing.

---

## 1. Components and Hooks must be pure

A pure component or hook:

- is **idempotent**: same props, state and context give the same output;
- has **no side effects during render**;
- **does not mutate non-local values**.

React may render a component many times, pause and resume a render, or throw a render away. Pure render code makes that safe.

**Rule of thumb:** code at the top level of a component body runs during render. Code inside event handlers and `useEffect` does not.

### 1.1 Components and Hooks must be idempotent

Don't read non-deterministic values (`new Date()`, `Math.random()`, `crypto.randomUUID()`) during render. Put them in state and update them from an Effect or an event handler.

```tsx
// ❌ Bad: different output on every render
function Clock() {
  const time = new Date()
  return <span>{time.toLocaleString()}</span>
}

// ✅ Good
function Clock() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return <span>{time.toLocaleString()}</span>
}
```

For stable IDs, use `useId()` instead of random values.

### 1.2 Side effects must run outside of render

Side effects (network requests, subscriptions, timers, DOM writes, logging to analytics) go in **event handlers** first. Use **`useEffect`** only when there is no event to attach the effect to, i.e. as a last resort for synchronizing with an external system.

**Allowed during render:**

- **Local mutation** of values created during that same render.

  ```tsx
  // ✅ Good: `items` is created during this render
  function FriendList({ friends }: { friends: Friend[] }) {
    const items: ReactNode[] = []
    for (const friend of friends) {
      items.push(<FriendItem key={friend.id} friend={friend} />)
    }
    return <section>{items}</section>
  }

  // ❌ Bad: module-level array persists and grows across renders
  const items: ReactNode[] = []
  function FriendList({ friends }: { friends: Friend[] }) {
    /* items.push(...) */
  }
  ```

- **Lazy initialization** that is idempotent and does not affect other components (e.g. `Calculator.initializeIfNotReady()`).

**Not allowed during render:**

- Writing to the DOM or `document`/`window`:

  ```tsx
  // ❌ Bad
  function ProductDetailPage({ product }: Props) {
    document.title = product.title
  }

  // ✅ Good
  function ProductDetailPage({ product }: Props) {
    useEffect(() => {
      document.title = product.title
    }, [product.title])
  }
  ```

- Mutating module-level variables, singletons, or anything not created in this render.

Test: calling the component twice in a row must be safe and must not change any other component's output.

### 1.3 Props and state are immutable

Props and state are a snapshot for one render. Never mutate them. Type props as `Readonly<...>` where it helps catch mistakes.

```tsx
// ❌ Bad: mutating props
function Post({ item }: { item: PostItem }) {
  item.url = new URL(item.url, base).href
  return <Link url={item.url}>{item.title}</Link>
}

// ✅ Good: derive a new value
function Post({ item }: { item: PostItem }) {
  const url = new URL(item.url, base).href
  return <Link url={url}>{item.title}</Link>
}
```

```tsx
// ❌ Bad: mutating state
let [count, setCount] = useState(0)
const handleClick = () => {
  count = count + 1
}

// ✅ Good: use the setter
const [count, setCount] = useState(0)
const handleClick = () => setCount((c) => c + 1)
```

For objects and arrays in state, always create new values (`{ ...obj, key }`, `[...arr, item]`, `arr.map(...)`, `arr.filter(...)`, `toSorted()`), never `push`, `splice`, `sort` or property assignment on the existing value.

### 1.4 Return values and arguments to Hooks are immutable

Never modify a value passed into a hook or returned from one. Hooks may memoize on their arguments, so mutating them causes stale or inconsistent results.

```ts
// ❌ Bad
function useIconStyle(icon: Icon) {
  const theme = useContext(ThemeContext)
  if (icon.enabled) {
    icon.className = computeStyle(icon, theme)
  }
  return icon
}

// ✅ Good
function useIconStyle(icon: Icon) {
  const theme = useContext(ThemeContext)
  const newIcon = { ...icon }
  if (icon.enabled) {
    newIcon.className = computeStyle(icon, theme)
  }
  return newIcon
}
```

### 1.5 Values are immutable after being passed to JSX

Once a value is used in JSX, don't mutate it. React may evaluate JSX eagerly. Do all mutation before creating the JSX.

```tsx
// ❌ Bad
const styles = { colour: 'red', size: 'large' }
const header = <Header styles={styles} />
styles.size = 'small'
const footer = <Footer styles={styles} />

// ✅ Good
const headerStyles = { colour: 'red', size: 'large' }
const footerStyles = { colour: 'red', size: 'small' }
```

---

## 2. React calls Components and Hooks

You describe what to render. React decides when and how often to call your code.

### 2.1 Never call component functions directly

Components are used only in JSX.

```tsx
// ✅ Good
function BlogPost() {
  return (
    <Layout>
      <Article />
    </Layout>
  )
}

// ❌ Bad
function BlogPost() {
  return <Layout>{Article()}</Layout>
}
```

Calling a component as a function makes its hooks belong to the caller, which breaks the Rules of Hooks and loses state, reconciliation and DevTools support.

### 2.2 Never pass around Hooks as regular values

Hooks are called, never stored, passed, or wrapped.

**Don't dynamically mutate a Hook** (no higher-order hooks):

```tsx
// ❌ Bad
function ChatInput() {
  const useDataWithLogging = withLogging(useData)
  const data = useDataWithLogging()
}

// ✅ Good: write a static hook with the behaviour inlined
function useDataWithLogging() {
  const data = useData()
  useLogging(data)
  return data
}
```

**Don't dynamically use Hooks** (no hooks as props or for dependency injection):

```tsx
// ❌ Bad
;<Button useData={useDataWithLogging} />

// ✅ Good: the component calls the hook itself
function Button() {
  const data = useDataWithLogging()
}
```

For tests, mock the network/server boundary rather than swapping hooks or components.

---

## 3. Rules of Hooks

Functions whose names start with `use` are Hooks. Name every custom hook `useSomething`, and don't use the `use` prefix for anything that isn't a hook.

### 3.1 Only call Hooks at the top level

Call hooks unconditionally, at the top level of a component or custom hook, **before any early return**.

Do **not** call hooks:

- inside conditions or loops;
- after a conditional `return`;
- in event handlers;
- inside functions passed to `useMemo`, `useReducer` or `useEffect`;
- inside `try` / `catch` / `finally`;
- in class components.

```tsx
// ✅ Good
function Counter({ enabled }: { enabled: boolean }) {
  const [count, setCount] = useState(0)
  const theme = useContext(ThemeContext)
  if (!enabled) return null
  return <span className={theme}>{count}</span>
}

// ❌ Bad: hook after an early return
function Counter({ enabled }: { enabled: boolean }) {
  if (!enabled) return null
  const theme = useContext(ThemeContext)
}

// ❌ Bad: conditional hook
function Counter({ enabled }: { enabled: boolean }) {
  if (enabled) {
    const [count, setCount] = useState(0)
  }
}
```

(`use()` from React 19 is the one exception: it may be called conditionally, but still only inside components or hooks and not inside `try`/`catch`.)

### 3.2 Only call Hooks from React functions

Call hooks only from function components or custom hooks, never from plain functions, utilities, or module scope.

```ts
// ❌ Bad
function setOnlineStatus() {
  const isOnline = useOnlineStatus();
}

// ✅ Good
function StatusBar() {
  const isOnline = useOnlineStatus();
  return <h1>{isOnline ? 'Online' : 'Offline'}</h1>;
}
```

---

## Review checklist

- [ ] No `Date`, `Math.random()` or other non-deterministic reads during render.
- [ ] No side effects in the component body; effects are in event handlers, or `useEffect` when unavoidable.
- [ ] No mutation of props, state, hook arguments/returns, or values already passed to JSX.
- [ ] State updates create new objects/arrays.
- [ ] Components are rendered with JSX, never called as functions.
- [ ] Hooks aren't passed as props, stored in variables, or wrapped by higher-order functions.
- [ ] Hooks are called unconditionally at the top level, before any early return.
- [ ] Hooks are called only from components or `use*` functions.
- [ ] `npm run lint` passes.

Source: <https://react.dev/reference/rules>
