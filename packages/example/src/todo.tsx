import { define, Show, List } from "kiaao";

// ── Types ──────────────────────────────────────────────

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

let nextId = 3;
const initialTodos: Todo[] = [
  { id: 1, text: "Learn kiaao", done: true },
  { id: 2, text: "Build something cool", done: false },
];

// ── Styles ─────────────────────────────────────────────

const styles = document.createElement("style");
styles.textContent = `
  .todo-app {
    max-width: 480px;
    margin: 32px auto;
    padding: 24px;
    border: 1px solid var(--border);
    border-radius: 8px;
    text-align: left;
  }
  .todo-app h2 {
    margin: 0 0 16px;
    font-size: 20px;
  }
  .todo-form {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .todo-form input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
    font-size: 14px;
    color: var(--text-h);
    background: transparent;
  }
  .todo-form input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .todo-add-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .todo-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .todo-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  .todo-item.done .todo-text {
    text-decoration: line-through;
    opacity: 0.5;
  }
  .todo-text {
    flex: 1;
    color: var(--text-h);
  }
  .todo-item input[type="text"] {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font: inherit;
    font-size: 14px;
    color: var(--text-h);
    background: transparent;
  }
  .todo-item button {
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    color: var(--text);
  }
  .todo-item button:hover {
    background: var(--code-bg);
  }
  .todo-delete-btn:hover {
    color: #ef4444;
    border-color: #ef4444;
  }
  .todo-edit-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
  .todo-stats {
    margin: 12px 0 0;
    font-size: 13px;
    color: var(--text);
  }
`;
document.head.appendChild(styles);

// ── TodoItem ───────────────────────────────────────────

function TodoItem(props: {
  todo: Todo;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number, text: string) => void;
}) {
  const [editing, setEditing] = define(false);
  const [editText, setEditText] = define(props.todo.text);

  const saveEdit = () => {
    const text = editText().trim();
    if (text) props.onEdit(props.todo.id, text);
    setEditing(false);
  };

  const startEdit = () => {
    setEditText(props.todo.text);
    setEditing(true);
  };

  return (
    <li class={props.todo.done ? "todo-item done" : "todo-item"}>
      <input
        type="checkbox"
        checked={props.todo.done}
        onChange={() => props.onToggle(props.todo.id)}
      />

      <Show when={editing}>
        {() => (
          <>
            <input
              type="text"
              value={props.todo.text}
              onInput={(e: any) => setEditText(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button class="todo-save-btn" onClick={saveEdit}>
              Save
            </button>
            <button class="todo-cancel-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        )}
      </Show>

      <Show when={() => !editing()}>
        {() => (
          <>
            <span class="todo-text">{props.todo.text}</span>
            <button class="todo-edit-btn" onClick={startEdit}>
              Edit
            </button>
          </>
        )}
      </Show>

      <button class="todo-delete-btn" onClick={() => props.onDelete(props.todo.id)}>
        Delete
      </button>
    </li>
  );
}

// ── TodoApp ────────────────────────────────────────────

export function TodoApp() {
  const [todos, setTodos] = define<Todo[]>(initialTodos);
  const [input, setInput] = define("");

  const addTodo = () => {
    const text = input().trim();
    if (!text) return;
    setTodos((prev) => [...prev, { id: nextId++, text, done: false }]);
    setInput("");
  };

  const toggleTodo = (id: number) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const deleteTodo = (id: number) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const editTodo = (id: number, text: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
  };

  return (
    <div class="todo-app">
      <h2>Todo List</h2>

      <div class="todo-form">
        <input
          type="text"
          value={input()}
          onInput={(e: any) => setInput(e.target.value)}
          placeholder="What needs to be done?"
          onKeyDown={(e: any) => e.key === "Enter" && addTodo()}
        />
        <button class="todo-add-btn" onClick={addTodo}>
          Add
        </button>
      </div>

      <ul class="todo-list">
        <List each={todos} key={(item: Todo) => item.id}>
          {(item: Todo) => (
            <TodoItem todo={item} onToggle={toggleTodo} onDelete={deleteTodo} onEdit={editTodo} />
          )}
        </List>
      </ul>

      <p class="todo-stats">{todos((v) => v.filter((t) => !t.done).length)} items left</p>
    </div>
  );
}
