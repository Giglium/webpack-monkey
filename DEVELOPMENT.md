# Development Notes

This project uses workspaces to place the examples and requires npm version 7.x or higher.

## Requirements

- Node 22+ (see `.nvmrc`)

If you use nvm:

```sh
nvm use
```

## Setup

```sh
npm install
```

## Playground

You'll be playing with the playground's userscripts during development.

1. Run:
   ```sh
   npm run playground
   ```
2. Open the dev script's URL printed in the console and install it as in the user guide.
3. Open the dev server's URL printed in the console, e.g. `http://localhost:8080`.
4. Now the playground userscripts are running on that page.

## Testing

Tests use Node's built-in test runner:

```sh
# run all tests
npm test

# update snapshots (when plugin output intentionally changes)
npm run test:u

# run tests with coverage report
npm run test:coverage
```

### Snapshots

Build tests run webpack in production mode and compare output against stored files in `__snapshots__/`. Run `npm run test:u` to regenerate them, then review the diff before committing.

## Building

```sh
npm run build
```

## Rebuilding examples

After making changes to the code, you can rebuild the examples to check if everything works as expected:

```sh
npm run build
npm run examples
```

## Syncing latest release version for examples (for maintainers)

```sh
npm run examples:remote
```
