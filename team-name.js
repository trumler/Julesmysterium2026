export function displayTeamName(name) {
  return name.replace(/\p{L}/u, letter => letter.toLocaleUpperCase('da-DK'));
}
