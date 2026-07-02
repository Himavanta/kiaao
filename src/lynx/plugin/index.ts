// kiaao — Lynx Rspeedy 插件（单入口主线程模式）

const PLUGIN_NAME = "plugin-kiaao-lynx";
const PLUGIN_MARK = "lynx:mark-main-thread";

export function pluginKiaaoLynx(): any {
  return {
    name: PLUGIN_NAME,
    setup(api: any) {
      api.modifyBundlerChain((chain: any, { environment }: any) => {
        const isLynx = environment.name === "lynx" || environment.name.startsWith("lynx-");
        if (!isLynx) return;

        chain.plugin(PLUGIN_MARK).use(
          class MarkMainThreadPlugin {
            apply(compiler: any) {
              const { RuntimeGlobals } = compiler.webpack;

              compiler.hooks.thisCompilation.tap(PLUGIN_MARK, (compilation: any) => {
                compilation.hooks.additionalTreeRuntimeRequirements.tap(
                  PLUGIN_MARK,
                  (chunk: any, set: Set<string>) => {
                    set.add(RuntimeGlobals.startup);
                    set.add(RuntimeGlobals.require);
                  },
                );

                compilation.hooks.processAssets.tap(
                  {
                    name: PLUGIN_MARK,
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
                  },
                  () => {
                    const assets = compilation.getAssets();
                    for (const asset of assets) {
                      if (asset.name.endsWith(".js") && !asset.name.includes("hot-update")) {
                        compilation.updateAsset(asset.name, asset.source, {
                          ...asset.info,
                          "lynx:main-thread": true,
                        });
                      }
                    }
                  },
                );
              });
            }
          },
        );
      });
    },
  };
}
