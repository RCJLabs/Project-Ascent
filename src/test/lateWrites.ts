/**
 * A state write that can land after its page has gone (PLAN.md M332).
 *
 * The shape, which has now put CI red twice with every test passing (M322's
 * `refreshDemo`, M330's three reads beside it):
 *
 * ```ts
 * useEffect(() => { void refresh(); }, []);
 * async function refresh() {
 *   const answer = await read();   // the page can close here
 *   setAnswer(answer);             // …and this lands on nothing
 * }
 * ```
 *
 * In a browser that is silent — React 19 drops an update to an unmounted
 * tree. Under the test runner it is fatal, because the environment is torn
 * down between files and React reads `window` on the way in. M323 fixed one
 * site by hand and a sweep in its notes counted seven; M331 found three more
 * beside the one it fixed. A list in a milestone is not a rule.
 *
 * ## What counts
 *
 * A call to a `useState` setter that is **late** — after an `await` in its
 * async function, or inside a `.then`/`.catch`/`.finally` callback, or the
 * setter itself handed to one — in code an **effect can reach**: the effect's
 * own body and everything nested in it, and any function in the same file
 * that body calls by name, followed through the functions those call.
 *
 * A handler nobody but a tap calls is left alone: the page is on screen
 * because the climber just touched it. The four launched-file paths M331
 * left open are exactly the case that rule has to catch — a handler that a
 * mount effect *also* calls, with a file the operating system handed over.
 *
 * ## What guards it
 *
 * A check of a **liveness flag** between the point the write became late and
 * the write itself: `if (!onScreen.current) return;` before it, or the write
 * inside `if (live) …` or `live && …`. A liveness flag is anything an effect's
 * cleanup in the same file sets to `true` or `false` — `onScreen.current`,
 * `alive.current`, `live`, `cancelled` — found rather than named, so a new
 * spelling of the same guard counts and a check of some unrelated boolean
 * does not.
 *
 * Written out in each page rather than as one shared hook, which would have
 * been the better shape: a hook shared by six lazy pages becomes its own
 * chunk, the entry names every chunk it may preload, and that name put the
 * first load over its budget (PLAN.md M332). The copies are held instead —
 * this finds a late write that skips its check, and `afterUnmount.test.tsx`
 * finds a copy that clears its flag without ever setting it.
 *
 * A check *before* the await guards nothing, and does not count.
 *
 * ## What it does not see
 *
 * Calls across files, calls through a property, and a function passed by
 * name into something that calls it later (`.then(refresh)` is followed only
 * when the name is a setter). Writes into a zustand store, which outlives
 * every page. It is a sweep for the shape that has actually failed, not a
 * proof that nothing else can.
 */

import ts from 'typescript';

export interface LateWrite {
  path: string;
  /** 1-based line of the write. */
  line: number;
  setter: string;
  /** The function the write is in, or `effect` for an effect's own body. */
  within: string;
  /** 1-based line of the effect that reaches it. */
  effect: number;
}

export interface LateWriteReport {
  unguarded: LateWrite[];
  guarded: LateWrite[];
}

type Fn = ts.FunctionLikeDeclaration;

const isFunction = (node: ts.Node): node is Fn =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node);

const calleeName = (call: ts.CallExpression): string | null =>
  ts.isIdentifier(call.expression) ? call.expression.text : null;

const PROMISE_CALLBACKS = new Set(['then', 'catch', 'finally']);

/** `x.then(…)`, `x.catch(…)`, `x.finally(…)`. */
const isPromiseCallback = (call: ts.CallExpression): boolean =>
  ts.isPropertyAccessExpression(call.expression) && PROMISE_CALLBACKS.has(call.expression.name.text);

function visit(node: ts.Node, each: (node: ts.Node) => void): void {
  each(node);
  ts.forEachChild(node, (child) => visit(child, each));
}

/** The function a node belongs to, stopping at `root`. */
function enclosing(node: ts.Node, root: ts.Node): Fn[] {
  const out: Fn[] = [];
  for (let at = node.parent; at; at = at.parent) {
    if (isFunction(at)) out.push(at);
    if (at === root) break;
  }
  return out;
}

/** An effect's callback, however it is written. */
function effectCallback(call: ts.CallExpression, named: Map<string, Fn>): Fn | null {
  const name = calleeName(call);
  if (name !== 'useEffect' && name !== 'useLayoutEffect') return null;
  const arg = call.arguments[0];
  if (!arg) return null;
  if (isFunction(arg)) return arg;
  if (ts.isIdentifier(arg)) return named.get(arg.text) ?? null;
  return null;
}

/** What an effect hands back to run on unmount. */
function cleanupsOf(effect: Fn): ts.Node[] {
  const body = effect.body;
  if (!body) return [];
  // `() => () => …`: the body *is* the cleanup.
  if (!ts.isBlock(body)) return isFunction(body) ? [body] : [];
  const out: ts.Node[] = [];
  for (const statement of body.statements) {
    if (ts.isReturnStatement(statement) && statement.expression) out.push(statement.expression);
  }
  return out;
}

/** `x = false`, `x.current = true` — the name `x`. */
function flagAssigned(node: ts.Node): string | null {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return null;
  const value = node.right.kind;
  if (value !== ts.SyntaxKind.TrueKeyword && value !== ts.SyntaxKind.FalseKeyword) return null;
  const target = node.left;
  if (ts.isIdentifier(target)) return target.text;
  if (ts.isPropertyAccessExpression(target) && target.name.text === 'current' && ts.isIdentifier(target.expression)) {
    return target.expression.text;
  }
  return null;
}

function mentionsFlag(node: ts.Node, flags: ReadonlySet<string>): boolean {
  let found = false;
  visit(node, (n) => {
    if (ts.isIdentifier(n) && flags.has(n.text)) found = true;
  });
  return found;
}

/** Whether a statement leaves the function: `return`, or a block ending in one. */
function leaves(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.some((s) => ts.isReturnStatement(s));
  return false;
}

/**
 * Where a write inside `fn` became late: the end of the last `await` of that
 * very function before it, or the start of a promise callback's body. Null
 * when it is not late in this function.
 */
function lateFrom(fn: Fn, at: number): number | null {
  const parent = fn.parent;
  if (parent && ts.isCallExpression(parent) && isPromiseCallback(parent) && parent.arguments.includes(fn as ts.Expression)) {
    return fn.body ? fn.body.getStart() : fn.getStart();
  }
  const isAsync = ts.getCombinedModifierFlags(fn as ts.Declaration) & ts.ModifierFlags.Async;
  if (!isAsync || !fn.body) return null;
  let last: number | null = null;
  visit(fn.body, (n) => {
    if (!ts.isAwaitExpression(n) || n.end > at) return;
    // An await in a nested function is that function's, not this one's.
    if (enclosing(n, fn)[0] !== fn) return;
    if (last === null || n.end > last) last = n.end;
  });
  return last;
}

/** Whether a check of a liveness flag stands between `from` and the write. */
function isGuarded(write: ts.Node, fn: Fn, from: number, flags: ReadonlySet<string>): boolean {
  for (let child: ts.Node = write, at = write.parent; at && child !== fn; child = at, at = at.parent) {
    // Inside `if (live) …`, or on the right of `live && …`, decided after it became late.
    if (ts.isIfStatement(at) && child === at.thenStatement && at.expression.getStart() >= from && mentionsFlag(at.expression, flags)) {
      return true;
    }
    if (
      ts.isBinaryExpression(at) &&
      at.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      child === at.right &&
      at.left.getStart() >= from &&
      mentionsFlag(at.left, flags)
    ) {
      return true;
    }
    // `if (!live) return;` earlier in the same block, after it became late.
    if (ts.isBlock(at)) {
      for (const statement of at.statements) {
        if (statement.getStart() >= child.getStart()) break;
        if (statement.getStart() < from) continue;
        if (ts.isIfStatement(statement) && leaves(statement.thenStatement) && mentionsFlag(statement.expression, flags)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function lateWrites(files: readonly { path: string; source: string }[]): LateWriteReport {
  const report: LateWriteReport = { unguarded: [], guarded: [] };

  for (const { path, source } of files) {
    const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const line = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    const setters = new Set<string>();
    const named = new Map<string, Fn>();
    visit(sf, (node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const init = node.initializer;
        if (
          ts.isArrayBindingPattern(node.name) &&
          ts.isCallExpression(init) &&
          /^(React\.)?useState$/.test(init.expression.getText(sf))
        ) {
          const second = node.name.elements[1];
          if (second && ts.isBindingElement(second) && ts.isIdentifier(second.name)) setters.add(second.name.text);
        }
        if (ts.isIdentifier(node.name)) {
          if (isFunction(init)) named.set(node.name.text, init);
          // `const f = useCallback(async () => …, [])`
          if (ts.isCallExpression(init) && calleeName(init) === 'useCallback' && init.arguments[0] && isFunction(init.arguments[0])) {
            named.set(node.name.text, init.arguments[0]);
          }
        }
      }
      if (ts.isFunctionDeclaration(node) && node.name) named.set(node.name.text, node);
    });
    if (setters.size === 0) continue;

    /*
     * A function that writes state as soon as it is called counts as a
     * setter itself. Settings reports through `setMessage`, a callback that
     * calls `setMessageState` and announces it — and a call to it after an
     * await is the same write, one name removed. Followed to a fixed point, so
     * a wrapper of a wrapper counts too.
     */
    for (let grew = true; grew; ) {
      grew = false;
      for (const [name, fn] of named) {
        if (setters.has(name) || ts.getCombinedModifierFlags(fn as ts.Declaration) & ts.ModifierFlags.Async) continue;
        let writes = false;
        visit(fn, (n) => {
          if (!ts.isCallExpression(n)) return;
          const called = calleeName(n);
          if (called && setters.has(called) && enclosing(n, fn)[0] === fn) writes = true;
        });
        if (writes) {
          setters.add(name);
          grew = true;
        }
      }
    }

    const effects: Fn[] = [];
    visit(sf, (node) => {
      if (!ts.isCallExpression(node)) return;
      const callback = effectCallback(node, named);
      if (callback) effects.push(callback);
    });

    const flags = new Set<string>();
    for (const effect of effects) {
      for (const cleanup of cleanupsOf(effect)) {
        visit(cleanup, (n) => {
          const flag = flagAssigned(n);
          if (flag) flags.add(flag);
        });
      }
    }

    const seen = new Set<string>();
    for (const effect of effects) {
      // Everything this effect can reach, followed through named calls.
      const roots: { fn: Fn; name: string }[] = [{ fn: effect, name: 'effect' }];
      const reached = new Set<Fn>([effect]);
      for (let i = 0; i < roots.length; i += 1) {
        visit(roots[i]!.fn, (node) => {
          if (!ts.isCallExpression(node)) return;
          const name = calleeName(node);
          const target = name ? named.get(name) : undefined;
          if (target && !reached.has(target)) {
            reached.add(target);
            roots.push({ fn: target, name: name! });
          }
        });
      }

      for (const { fn: root, name } of roots) {
        visit(root, (node) => {
          let write: ts.Node | null = null;
          let setter = '';
          if (ts.isCallExpression(node)) {
            const called = calleeName(node);
            if (called && setters.has(called)) {
              write = node;
              setter = called;
            } else if (isPromiseCallback(node)) {
              // `.then(setThing)`: the setter is the callback.
              const handed = node.arguments.find((a) => ts.isIdentifier(a) && setters.has(a.text));
              if (handed && ts.isIdentifier(handed)) {
                const where: LateWrite = { path, line: line(handed), setter: handed.text, within: name, effect: line(effect) };
                const key = `${path}:${where.line}:${where.setter}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  report.unguarded.push(where);
                }
              }
            }
          }
          if (!write) return;

          // Late in whichever enclosing function made it so, innermost first.
          let from: number | null = null;
          let late: Fn | null = null;
          for (const fn of enclosing(write, root)) {
            from = lateFrom(fn, write.getStart());
            if (from !== null) {
              late = fn;
              break;
            }
          }
          if (late === null || from === null) return;

          const where: LateWrite = { path, line: line(write), setter, within: name, effect: line(effect) };
          const key = `${path}:${where.line}:${setter}`;
          if (seen.has(key)) return;
          seen.add(key);
          (isGuarded(write, late, from, flags) ? report.guarded : report.unguarded).push(where);
        });
      }
    }
  }
  return report;
}

/** One line per write, for a failure message a person can act on. */
export const describe = (w: LateWrite): string =>
  `${w.path}:${w.line} ${w.setter}() in ${w.within}, reached from the effect at line ${w.effect}`;
