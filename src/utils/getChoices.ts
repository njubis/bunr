/**
 * Find dataset entries matching the searchString.
 *
 * Will search throught matching keys or values recursively
 *
 * If searchString is undefined, return the `dataset`
 */
export function getMatchingChoices<T extends Record<string, any>[] = []>(
  dataset: T,
  searchString?: string
) {
  /** Utility to find keys or values of an object matching the `searchString` */
  const matchesSearch = (obj: object, search: string) => {
    const searchLower = String(search).toLowerCase();
    function recursiveCheck(current: object) {
      if (current === null || current === undefined) return false;
      if (typeof current !== "object") {
        return String(current).toLowerCase().includes(searchLower);
      }
      for (const [key, value] of Object.entries(current)) {
        if (key.toLowerCase().includes(searchLower)) {
          return true;
        }
        if (typeof value === "object") {
          if (recursiveCheck(value)) return true;
        } else if (
          value != null &&
          String(value).toLowerCase().includes(searchLower)
        ) {
          return true;
        }
      }
      return false;
    }

    return recursiveCheck(obj);
  };
  if (!searchString) return dataset;
  const matchingChoices = dataset.filter((entry) =>
    matchesSearch(entry, searchString)
  );
  return matchingChoices;
}
