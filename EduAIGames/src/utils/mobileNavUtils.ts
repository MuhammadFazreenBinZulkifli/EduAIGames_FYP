/** Routes where the mobile top bar is always hidden (active quiz session, student games). */
export function shouldHideMobileNavByPath(pathname: string): boolean {
  // Student game play routes
  if (pathname.startsWith('/student/games/')) return true

  // Active quiz session: /student/quiz/:classId/:quizId
  if (/^\/student\/quiz\/\d+\/\d+/.test(pathname)) return true

  return false
}
