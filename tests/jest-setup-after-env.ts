import * as matchers from "jest-extended"
import { noop } from "lodash"

expect.extend(matchers)

declare global {
  namespace jest {
    interface It {
      /**
       * When the test fails in headful mode, the Puppeteer browser will keep open until
       * you close it manually. This is useful for debugging.
       */
      browser: It
    }
  }
}

const isHeadful = process.env.HEADLESS === "false" && !process.env.CI

// extend timeout to an hour for headful mode
const defaultBrowserCaseTimeout = isHeadful ? 60 * 60 * 1000 : __BROWSER_CASE_TIMEOUT__

it.browser = wrapIt(it)
it.browser.only = wrapIt(it.only)
it.browser.skip = wrapIt(it.skip)
it.browser.failing = wrapIt(it.failing)
it.browser.todo = wrapIt(it.todo)
it.browser.concurrent = wrapIt(it.concurrent)
it.browser.each = wrapEach(it.each)

function getBrowserTestName(baseName: string) {
  return `[browser] ${baseName}`
}

function wrapIt(original: jest.It): jest.It {
  type ItFunction = {
    [K in keyof jest.It]: K extends "each"
      ? never
      : jest.It[K] extends (...args: infer A) => infer R
      ? (...args: A) => R
      : never
  }[keyof jest.It]

  const itWrapper: ItFunction = (name, fn, timeout = defaultBrowserCaseTimeout) => {
    if (process.env.EXT) {
      return original(getBrowserTestName(name), fn && wrapFn(fn), timeout)
    } else {
      return original.skip(getBrowserTestName(name), noop)
    }
  }

  return itWrapper as jest.It
}

function wrapEach(original: jest.Each) {
  const eachWrapper: jest.Each = (...args: any[]) => {
    if (process.env.EXT) {
      const originalReturn = original.apply(globalThis, args as any)

      const eachReturnWrapper: typeof originalReturn = (
        name,
        fn,
        timeout = defaultBrowserCaseTimeout
      ) => {
        originalReturn(getBrowserTestName(name), wrapFn(fn), timeout)
      }
      return eachReturnWrapper
    }

    return it.skip.each.apply(globalThis, args as any)
  }
  return eachWrapper
}

function wrapFn(fn: Function) {
  const fnWrapper = async (...args: unknown[]) => {
    page.setDefaultTimeout(__PUPPETEER_TIMEOUT__)

    if (isHeadful) {
      try {
        await fn(...args)
      } catch (e) {
        if (browser.isConnected()) {
          console.error(e)
          await new Promise((resolve) => browser.on("disconnected", resolve))
        }
        throw e
      }
    }

    return fn(...args)
  }
  return fnWrapper
}
