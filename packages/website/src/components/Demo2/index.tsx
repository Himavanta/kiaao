import { use } from "kiaao";

export default function () {
  const state = use({
    name: "tom",
    age: 48,
  });

  const name = use(state, () => state().name);
  const NameUpcase = use(name, () => name().toUpperCase());

  const NameUpcaseCache = use(NameUpcase, () => {
    console.log("NameUpcaseCache");
    return NameUpcase();
  });

  const age = use(state, () => state().age);

  return (
    <div>
      <div>NameUpcaseCache:{NameUpcaseCache}</div>
      <div>NameUpcase:{NameUpcase}</div>
      <div>name:{name}</div>
      <div>age:{age}</div>
      <div>
        <button
          onClick={() => {
            const s = state();
            state({ ...s, age: s.age + 1 });
          }}
        >
          age +{" "}
        </button>
        <button
          onClick={() => {
            const s = state();
            state({ ...s, age: s.age - 1 });
          }}
        >
          age -{" "}
        </button>
      </div>
      <div>
        <button onClick={() => state({ ...state(), name: "ToM" })}>Name Change to 'ToM'</button>
      </div>
    </div>
  );
}
