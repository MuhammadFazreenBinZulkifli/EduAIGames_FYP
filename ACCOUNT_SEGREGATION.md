# Account Segregation Implementation

## Overview
This document outlines the account segregation changes made to ensure each instructor and student has isolated data. This means:
- **Instructor1** has their own set of quizzes, courses, and student data
- **Instructor2** has their own separate set of quizzes, courses, and students
- **Student1** can only see quizzes from courses they're enrolled in and their own grades
- **Student2** has separate enrollment and grades data from Student1

## Database Schema Changes

### New Tables Added

#### 1. **courses** Table
```sql
CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  instructor_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);
```
- **Purpose**: Organize quizzes into courses created by specific instructors
- **Key Feature**: Each course is owned by one instructor via `instructor_id`

#### 2. **student_enrollments** Table
```sql
CREATE TABLE student_enrollments (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE(student_id, course_id)
);
```
- **Purpose**: Create a many-to-many relationship between students and courses
- **Key Feature**: Students can only access quizzes from courses they're enrolled in

### Modified Tables

#### **quizzes** Table
Added `course_id` column to link quizzes to courses:
```sql
ALTER TABLE quizzes ADD COLUMN course_id INT REFERENCES courses(id) ON DELETE SET NULL;
```
- Quizzes still require `instructor_id` for ownership
- Optional `course_id` groups quizzes into courses
- `instructor_id` ensures only that instructor can modify the quiz

## Backend API Changes

### New Routes

#### Course Management: `/api/courses`

**Create Course** (Instructor only)
```
POST /api/courses
Body: {
  instructor_id: number,
  title: string,
  description?: string
}
```

**Get Instructor's Courses**
```
GET /api/courses/instructor/:instructorId
```

**Get Student's Enrolled Courses**
```
GET /api/courses/student/:studentId
```

**Update Course**
```
PUT /api/courses/:courseId
Body: {
  title: string,
  description: string
}
```

**Delete Course**
```
DELETE /api/courses/:courseId
```

**Enroll Student in Course**
```
POST /api/courses/:courseId/enroll
Body: { student_id: number }
```

**Unenroll Student from Course**
```
DELETE /api/courses/:courseId/enroll/:studentId
```

**Get Enrolled Students**
```
GET /api/courses/:courseId/students
```

**Check Student Enrollment**
```
GET /api/courses/:courseId/enrolled/:studentId
```

### Modified Routes

#### Quiz Management: `/api/quizzes`

**Create Quiz** - Now supports optional `course_id`
```
POST /api/quizzes
Body: {
  instructor_id: number,
  course_id?: number,
  title: string,
  description?: string,
  questions: Question[]
}
```

**Get Instructor's Quizzes** - Only returns quizzes for that instructor
```
GET /api/quizzes/instructor/:instructorId
```

**Get Student Quiz Attempts** - Only returns attempts by that specific student
```
GET /api/quizzes/attempts/student/:studentId
```

## Frontend Changes

### Component Updates

#### 1. **QuizCreation.tsx**
- **Change**: Now uses API calls instead of localStorage
- **User Isolation**: Fetches and displays quizzes only for the logged-in instructor
- **Features**:
  - `instructorId` prop passed from App.tsx
  - Fetches quizzes via `GET /api/quizzes/instructor/:instructorId`
  - Creates/updates quizzes with `instructor_id` field
  - Deletes quizzes only the instructor owns

#### 2. **StudentGrades.tsx**
- **Change**: Now fetches grades from API based on student ID
- **User Isolation**: Shows only that student's quiz attempts
- **Features**:
  - `studentId` prop passed from App.tsx
  - Fetches attempts via `GET /api/quizzes/attempts/student/:studentId`
  - Uses correct API field names: `quiz_title`, `correct_answers`, `total_questions`, `completed_at`
  - Added loading and error states

#### 3. **CourseCreation.tsx**
- **Change**: Added `instructorId` prop for future course management
- **User Isolation**: Prepared for instructor-specific course listing

#### 4. **StudentCourses.tsx**
- **Change**: Added `studentId` prop for future student-specific course filtering
- **User Isolation**: Ready to fetch only courses student is enrolled in

#### 5. **QuizAnswering.tsx**
- **Change**: Added `studentId` prop
- **User Isolation**: Ready to fetch only available quizzes for the student

#### 6. **App.tsx**
- **Change**: Now passes user ID to relevant components
- **User Isolation**: Each component knows the logged-in user's ID

#### 7. **StudentDashboard.tsx & InstructorDashboard.tsx**
- **Change**: Updated User interface to include optional `id` field
- **User Isolation**: Now passes user.id to child components

#### 8. **Login.tsx** & **Registration.tsx**
- **Status**: Already included user ID in returned data from API

## Data Flow

### Instructor Creating a Quiz
1. Instructor logs in → App.tsx has `loggedInUser.id` (e.g., instructor_id = 1)
2. Instructor navigates to Quiz Creation
3. QuizCreation component receives `instructorId={1}` prop
4. Component fetches: `GET /api/quizzes/instructor/1`
5. Instructor creates quiz: `POST /api/quizzes` with `instructor_id: 1`
6. Only this instructor's quizzes are displayed
7. Only this instructor can edit/delete their quizzes

### Student Taking a Quiz
1. Student logs in → App.tsx has `loggedInUser.id` (e.g., student_id = 5)
2. Student navigates to view grades
3. StudentGrades component receives `studentId={5}` prop
4. Component fetches: `GET /api/quizzes/attempts/student/5`
5. Only this student's quiz attempts are displayed
6. Only this student's grades are visible

## Security Considerations

### Current Implementation
- User ID is passed from frontend
- API should validate ownership before returning/modifying data
- Students can only see their own attempts
- Instructors can only see/modify their own quizzes

### Future Enhancements (Recommended)
- Implement JWT authentication to verify user ownership server-side
- Add middleware to validate `instructor_id` matches logged-in user for quiz operations
- Add middleware to validate `student_id` matches logged-in user for attempt queries
- Hash and protect user IDs in URLs

## Testing Instructions

### Test Instructor Isolation

1. **Create Instructor 1 Account**
   - Register as: username=`teacher1`, email=`teacher1@example.com`, role=`Instructor`

2. **Create Instructor 2 Account**
   - Register as: username=`teacher2`, email=`teacher2@example.com`, role=`Instructor`

3. **Test Quiz Creation**
   - Login as Instructor 1
   - Create quiz "Math 101"
   - Logout

4. **Test Quiz Isolation**
   - Login as Instructor 2
   - Go to Quiz Management
   - Should NOT see "Math 101" quiz
   - Create quiz "Science 101"
   - Logout

5. **Verify Back to Instructor 1**
   - Login as Instructor 1
   - Should see only "Math 101", not "Science 101"

### Test Student Isolation

1. **Create Student 1 Account**
   - Register as: username=`student1`, email=`student1@example.com`, role=`Student`

2. **Create Student 2 Account**
   - Register as: username=`student2`, email=`student2@example.com`, role=`Student`

3. **Enroll Students**
   - Login as Instructor 1
   - Enroll Student 1 in a course with Math 101 quiz
   - Logout

4. **Test Student Grades**
   - Login as Student 1
   - Take the Math 101 quiz
   - Check grades - should see this attempt
   - Logout

5. **Verify Student 2 Isolation**
   - Login as Student 2
   - View grades - should see NO quiz attempts
   - Should not see Student 1's grades

## Database Indexes Added

For optimal performance:
- `idx_courses_instructor` - ON `courses(instructor_id)`
- `idx_student_enrollments_student` - ON `student_enrollments(student_id)`
- `idx_student_enrollments_course` - ON `student_enrollments(course_id)`
- `idx_quizzes_course` - ON `quizzes(course_id)`

## API Files Modified/Created

### Created
- `/server/src/courseQueries.ts` - Course management database functions
- `/server/src/routes/courses.ts` - Course management API endpoints

### Modified
- `/server/src/setupDatabase.ts` - Added courses and student_enrollments tables
- `/server/src/quizQueries.ts` - Updated Quiz interface to include course_id
- `/server/src/routes/quizzes.ts` - Updated to support course_id
- `/server/src/index.ts` - Added courses route and db-check for new tables

## Frontend Files Modified

### Created (New)
- `/EduAIGames/src/components/QuizCreation.tsx` (Rewritten)

### Modified
- `/EduAIGames/src/App.tsx` - Passes user ID to components
- `/EduAIGames/src/components/StudentGrades.tsx` - Uses API, isolates by student_id
- `/EduAIGames/src/components/StudentDashboard.tsx` - Added id to User interface
- `/EduAIGames/src/components/InstructorDashboard.tsx` - Added id to User interface
- `/EduAIGames/src/components/CourseCreation.tsx` - Added instructorId prop
- `/EduAIGames/src/components/StudentCourses.tsx` - Added studentId prop
- `/EduAIGames/src/components/QuizAnswering.tsx` - Added studentId prop

## Deployment Steps

1. **Database Migration**
   ```bash
   # Backend will auto-create tables on startup
   npm run dev
   ```

2. **Restart Server**
   ```bash
   # Kill existing server and restart
   npm run dev
   ```

3. **Test API Endpoints**
   ```bash
   # Verify database structure
   curl http://localhost:5000/api/db-check
   ```

4. **Frontend Refresh**
   - Clear browser cache
   - Refresh React app
   - Test login and data isolation

## Known Limitations & Future Work

1. **Frontend Validation** - Add client-side validation of user ownership
2. **JWT Authentication** - Implement token-based auth for better security
3. **Course Management UI** - Create UI for managing course enrollments
4. **Quiz Sharing** - Future feature: Allow instructors to share quizzes
5. **Audit Logging** - Track who created/modified/deleted quizzes
6. **Role-Based Access Control (RBAC)** - Implement more granular permissions

## Support

For issues with account segregation:
1. Check that user IDs are being passed correctly from frontend
2. Verify API endpoints return 401/403 for unauthorized access
3. Check browser console for API errors
4. Verify database has courses and student_enrollments tables:
   ```sql
   \dt
   ```
