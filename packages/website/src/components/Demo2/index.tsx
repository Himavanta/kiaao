import { define, derive } from "kiaao";

export default function () {
  const [state, setState] = define({
    name: "tom",
    age: 48,
  });

  const NameUpcase = derive(() => state((v) => v.name)().toUpperCase());

  const NameUpcaseCache = derive(() => {
    console.log("NameUpcaseCache");
    return NameUpcase();
  });

  return (
    <div>
      <div>NameUpcaseCache:{NameUpcaseCache}</div>
      <div>NameUpcase:{NameUpcase}</div>
      <div>name:{state((v) => v.name)}</div>
      <div>age:{state((v) => v.age)}</div>
      <div>
        <button onClick={() => setState((v) => ({ ...v, age: v.age + 1 }))}>age + </button>
        <button onClick={() => setState((v) => ({ ...v, age: v.age - 1 }))}>age - </button>
      </div>
      <div>
        <button onClick={() => setState((v) => ({ ...v, name: "ToM" }))}>
          Name Change to 'ToM'
        </button>
      </div>
    </div>
  );
}
