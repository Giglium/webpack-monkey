import { expect } from "@playwright/test"
import axios from "axios"
import fs from "fs"
import { noop } from "lodash"
import MiniCssExtractPlugin from "mini-css-extract-plugin"
import path from "path"
import postcssPresetEnv from "postcss-preset-env"
import webpack from "webpack"
import BaseWebpackDevServer from "webpack-dev-server"
import { merge } from "webpack-merge"
import { HotLoaderOptions, createHotLoaderRule } from "./hot-loader"

export async function testBuild(config: webpack.Configuration) {
  config = {
    ...config,
    mode: "production",
  }

  const compiler = webpack(config)
  const stats = await compilerRun(compiler)
  const files = stats.chunks!.flatMap((chunk) => chunk.files)

  expect(files).toHaveLength(1)

  const content = fs.readFileSync(`${config.output!.path}/${files[0]}`, "utf-8")

  expect(content).toMatchSnapshot()
}

export function compilerRun(compiler: webpack.Compiler) {
  return new Promise<webpack.StatsCompilation>((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) {
        if ((err as any).details) {
          err.message = `${err.message} (${(err as any).details})`
        }

        return reject(err)
      }

      if (!stats) {
        return reject(new Error("No stats"))
      }

      const info = stats.toJson()

      if (stats.hasErrors()) {
        return reject(new Error(info.errors?.map((e) => e.message).join("\n\n")))
      }

      if (stats.hasWarnings()) {
        console.warn(info.warnings)
      }

      compilerClose(compiler)
        .then(() => resolve(info))
        .catch(reject)
    })
  })
}

export function compilerClose(compiler: webpack.Compiler) {
  return new Promise<void>((resolve, reject) => {
    compiler.close((err) => (err ? reject(err) : resolve()))
  })
}

export function compilerCompile(compiler: webpack.Compiler) {
  return new Promise<webpack.Compilation>((resolve, reject) => {
    compiler.compile((err, compilation) => {
      if (err) {
        if ((err as any).details) {
          err.message = `${err.message} (${(err as any).details})`
        }

        return reject(err)
      }

      if (!compilation) {
        return reject(new Error("No compilation"))
      }

      resolve(compilation)
    })
  })
}

export interface UseDevServerOptions extends webpack.Configuration {
  noCompile?: boolean
}

export interface UseDevServerContext {
  server: WebpackDevServer
  origin: string
}

export async function useDevServer(
  { noCompile, ...config }: UseDevServerOptions,
  fn: (context: UseDevServerContext) => Promise<void>,
) {
  config = merge({}, config, {
    mode: "development",
    devServer: {
      host: config.devServer?.host || "127.0.0.1",
      port: config.devServer?.port || (await getFreePort()),
    },
  })

  if (noCompile) {
    config = merge({}, config, {
      devServer: {
        hot: false,
      },
    })
  }

  const compiler = webpack(config)

  if (noCompile) {
    preventCompilation(compiler)
  }

  const server = new WebpackDevServer(config.devServer, compiler)

  try {
    await server.start().catch((e) => {
      if (!(e instanceof CompilationPrevention)) {
        throw e
      }
    })

    const port = +(server.options.port || NaN)
    const host = server.options.host || "127.0.0.1"

    if (isNaN(port)) {
      throw new Error(`Invalid port: ${server.options.port}`)
    }

    await fn({
      server,
      origin: `http://${host}:${port}`,
    })
  } finally {
    console.log("Closing server...")
    await compilerClose(compiler)
    await server.stop().catch(console.warn)
  }
}

export interface UseDevServerHotContext extends UseDevServerContext {
  hotLoaderOptions: HotLoaderOptions
}

export function useDevServerHot(
  options: UseDevServerOptions,
  fn: (context: UseDevServerHotContext) => Promise<void>,
) {
  const hotLoaderRule = createHotLoaderRule({})

  options = merge({}, options, {
    module: {
      rules: [hotLoaderRule],
    },
  })

  return useDevServer(options, (ctx) => fn({ ...ctx, hotLoaderOptions: hotLoaderRule.options }))
}

class CompilationPrevention extends Error {
  constructor() {
    super("compilation prevented as expected.")
    this.stack = undefined
  }
}

export function preventCompilation(compiler: webpack.Compiler) {
  const flag = "__preventCompilation__"

  if ((compiler.compile as any)[flag]) {
    return
  }

  compiler.compile = (callback) => {
    callback(new CompilationPrevention())
  }
  ;(compiler.compile as any)[flag] = true
}

export function withCommonConfig(...config: webpack.Configuration[]) {
  const defaultConfig: webpack.Configuration = {
    resolve: {
      extensions: [".ts", ".js"],
      alias: {
        "@": path.resolve(__dirname, "../../src"),
      },
    },
    module: {
      rules: [
        {
          resourceQuery: /raw/,
          type: "asset/source",
        },
        {
          test: /\.([cm]?ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: "ts-loader",
            options: {
              transpileOnly: true,
            },
          },
        },
      ],
    },
    devServer: {
      static: {
        directory: path.resolve(__dirname, ".."),
      },
      headers(req, res, context) {
        if (req.path.includes("strict-csp.html")) {
          return new Headers({
            "Content-Security-Policy": "default-src 'self'",
          })
        }
        return {}
      },
    },
    output: {
      clean: true,
    },
    devtool: false,
    watch: false,
    stats: "errors-warnings",
  }
  return merge({}, defaultConfig, ...config)
}

const commonCssRule = {
  test: /\.css$/i,
  use: [
    {
      loader: "css-loader",
      options: {
        modules: {
          auto: true,
          localIdentName: "[name]__[local]--[hash:base64:4]",
        },
      },
    },
    {
      loader: "postcss-loader",
      options: {
        postcssOptions: {
          plugins: [postcssPresetEnv()],
        },
      },
    },
  ],
}

export function withMiniCssExtract(config?: webpack.Configuration): webpack.Configuration {
  const overrides = {
    plugins: [new MiniCssExtractPlugin()],
    module: {
      rules: [
        {
          ...commonCssRule,
          use: [MiniCssExtractPlugin.loader, ...commonCssRule.use],
        },
      ],
    },
  }
  return config ? merge({}, config, overrides) : overrides
}

export function withStyleLoader(config?: webpack.Configuration): webpack.Configuration {
  const overrides = {
    module: {
      rules: [
        {
          ...commonCssRule,
          use: ["style-loader", ...commonCssRule.use],
        },
      ],
    },
  }
  return config ? merge({}, config, overrides) : overrides
}

class WebpackDevServer extends BaseWebpackDevServer {
  rejectStart: (err: unknown) => void = noop

  constructor(...args: ConstructorParameters<typeof BaseWebpackDevServer>) {
    super(...args)

    this["createServer"] = async function (...args: any[]) {
      const result = await BaseWebpackDevServer.prototype["createServer"].apply(this, args)

      // WebpackDevServer does not properly handle this error when starting,
      // causing the process to hang, so we need to handle it ourselves.
      // related: https://github.com/webpack/webpack-dev-server/issues/4724
      this.server!.on("error", (err: unknown) => {
        this.rejectStart(err)
      })

      return result
    }
  }

  override async start() {
    return new Promise<void>((resolve, reject) => {
      this.rejectStart = reject
      super.start().then(resolve, reject)
    })
  }
}

export async function getFreePort(): Promise<number> {
  const port: string = (await axios.get(`${process.env.GLOBAL_SERVER}/freePort`)).data

  if (isNaN(+port)) throw new Error(`Received invalid port: ${port}`)

  return +port
}
