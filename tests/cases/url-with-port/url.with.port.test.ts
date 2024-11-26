import path from "path"
import { monkey } from "../../../src"
import { test } from "../../env"
import { testBuild, withCommonConfig } from "../../utils/webpack"

const config = withCommonConfig({
  entry: path.resolve(__dirname, "index.js"),
  output: {
    path: path.resolve(__dirname, "dist"),
  },
})

test("build", () => testBuild(monkey(config)))
