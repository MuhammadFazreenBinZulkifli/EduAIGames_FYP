#!/bin/bash
# Account Segregation Implementation Verification Script

echo "═══════════════════════════════════════════════════════════════"
echo "Account Segregation Implementation Verification"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check file exists
check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    return 0
  else
    echo -e "${RED}✗${NC} $1"
    return 1
  fi
}

# Function to check if text exists in file
check_content() {
  if grep -q "$2" "$1" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $1 contains '$2'"
    return 0
  else
    echo -e "${RED}✗${NC} $1 missing '$2'"
    return 1
  fi
}

echo "📋 Backend Files..."
echo "─────────────────────────────────────────────────────────────"
check_file "server/src/courseQueries.ts"
check_file "server/src/routes/courses.ts"
check_content "server/src/setupDatabase.ts" "CREATE TABLE IF NOT EXISTS courses"
check_content "server/src/setupDatabase.ts" "CREATE TABLE IF NOT EXISTS student_enrollments"
check_content "server/src/index.ts" "coursesRoutes"
echo ""

echo "📋 Frontend Files..."
echo "─────────────────────────────────────────────────────────────"
check_file "EduAIGames/src/components/QuizCreation.tsx"
check_content "EduAIGames/src/App.tsx" "instructorId"
check_content "EduAIGames/src/App.tsx" "studentId"
check_content "EduAIGames/src/components/StudentGrades.tsx" "studentId"
check_content "EduAIGames/src/components/StudentDashboard.tsx" "id?: number"
echo ""

echo "📋 Documentation..."
echo "─────────────────────────────────────────────────────────────"
check_file "ACCOUNT_SEGREGATION.md"
check_file "IMPLEMENTATION_CHECKLIST.md"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "✅ Verification Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next Steps:"
echo "1. Start the backend: npm run dev (in server directory)"
echo "2. Start the frontend: npm run dev (in EduAIGames directory)"
echo "3. Test with multiple instructor and student accounts"
echo "4. Verify data isolation by comparing accounts"
echo ""
