# API Reference - Quiz Application Database Endpoints

## Base URL
```
http://localhost:5000/api
```

---

## Authentication Endpoints

### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "username": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "Instructor" // or "Student"
}
```

**Response (201 Created):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "username": "John Doe",
    "email": "john@example.com",
    "role": "Instructor"
  }
}
```

---

### Login User
```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "John Doe",
    "email": "john@example.com",
    "role": "Instructor"
  }
}
```

---

## Quiz Management Endpoints

### Create Quiz (Instructor Only)
```http
POST /quizzes
Content-Type: application/json

{
  "instructor_id": 1,
  "title": "Advanced JavaScript",
  "description": "Test your JavaScript knowledge",
  "questions": [
    {
      "question_text": "What is a closure?",
      "question_type": "multiple-choice",
      "correct_answer": "A function with access to outer scope",
      "question_order": 1,
      "options": [
        {
          "option_text": "A function with access to outer scope",
          "option_order": 1
        },
        {
          "option_text": "A loop that closes",
          "option_order": 2
        },
        {
          "option_text": "A compiled function",
          "option_order": 3
        },
        {
          "option_text": "None of the above",
          "option_order": 4
        }
      ]
    },
    {
      "question_text": "JavaScript is object-oriented",
      "question_type": "true-false",
      "correct_answer": "true",
      "question_order": 2,
      "options": []
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "message": "Quiz created successfully",
  "quiz": {
    "id": 1,
    "instructor_id": 1,
    "title": "Advanced JavaScript",
    "description": "Test your JavaScript knowledge",
    "created_at": "2026-01-21T10:30:00Z",
    "questions": [...]
  }
}
```

---

### Get All Quizzes (All Users)
```http
GET /quizzes
```

**Response (200 OK):**
```json
{
  "quizzes": [
    {
      "id": 1,
      "instructor_id": 1,
      "title": "Advanced JavaScript",
      "description": "Test your JavaScript knowledge",
      "created_at": "2026-01-21T10:30:00Z",
      "questions": [...]
    }
  ]
}
```

---

### Get Instructor's Quizzes
```http
GET /quizzes/instructor/:instructorId
```

**Example:**
```
GET /quizzes/instructor/1
```

**Response (200 OK):**
```json
{
  "quizzes": [
    {
      "id": 1,
      "instructor_id": 1,
      "title": "Advanced JavaScript",
      "questions": [...]
    }
  ]
}
```

---

### Get Specific Quiz
```http
GET /quizzes/:quizId
```

**Example:**
```
GET /quizzes/1
```

**Response (200 OK):**
```json
{
  "quiz": {
    "id": 1,
    "instructor_id": 1,
    "title": "Advanced JavaScript",
    "description": "Test your JavaScript knowledge",
    "created_at": "2026-01-21T10:30:00Z",
    "updated_at": "2026-01-21T10:30:00Z",
    "questions": [
      {
        "id": 1,
        "question_text": "What is a closure?",
        "question_type": "multiple-choice",
        "correct_answer": "A function with access to outer scope",
        "question_order": 1,
        "options": [
          {
            "id": 1,
            "option_text": "A function with access to outer scope",
            "option_order": 1
          },
          ...
        ]
      },
      ...
    ]
  }
}
```

---

### Update Quiz (Instructor Only)
```http
PUT /quizzes/:quizId
Content-Type: application/json

{
  "title": "Advanced JavaScript - Updated",
  "description": "Updated description",
  "questions": [...]
}
```

**Response (200 OK):**
```json
{
  "message": "Quiz updated successfully",
  "quiz": {...}
}
```

---

### Delete Quiz (Instructor Only)
```http
DELETE /quizzes/:quizId
```

**Example:**
```
DELETE /quizzes/1
```

**Response (200 OK):**
```json
{
  "message": "Quiz deleted successfully"
}
```

---

## Quiz Attempt Endpoints

### Submit Quiz Attempt (Student)
```http
POST /quizzes/attempts/submit
Content-Type: application/json

{
  "student_id": 2,
  "quiz_id": 1,
  "score": 85.5,
  "correct_answers": 17,
  "total_questions": 20
}
```

**Response (201 Created):**
```json
{
  "message": "Quiz attempt saved successfully",
  "attempt": {
    "id": 1,
    "student_id": 2,
    "quiz_id": 1,
    "score": 85.5,
    "correct_answers": 17,
    "total_questions": 20,
    "completed_at": "2026-01-21T14:45:30.000Z"
  }
}
```

---

### Get Student's Quiz Attempts (Student)
```http
GET /quizzes/attempts/student/:studentId
```

**Example:**
```
GET /quizzes/attempts/student/2
```

**Response (200 OK):**
```json
{
  "attempts": [
    {
      "id": 1,
      "student_id": 2,
      "quiz_id": 1,
      "score": 85.5,
      "correct_answers": 17,
      "total_questions": 20,
      "completed_at": "2026-01-21T14:45:30.000Z",
      "quiz_title": "Advanced JavaScript",
      "quiz_description": "Test your JavaScript knowledge"
    },
    {
      "id": 2,
      "student_id": 2,
      "quiz_id": 2,
      "score": 92.0,
      "correct_answers": 23,
      "total_questions": 25,
      "completed_at": "2026-01-21T15:20:15.000Z",
      "quiz_title": "Python Basics",
      "quiz_description": "Learn Python fundamentals"
    }
  ]
}
```

---

### Get All Student Performance Data (Instructor)
```http
GET /quizzes/performance/all
```

**Response (200 OK):**
```json
{
  "grades": [
    {
      "student_id": 2,
      "username": "Jane Student",
      "quiz_title": "Advanced JavaScript",
      "score": 85.5,
      "correct_answers": 17,
      "total_questions": 20,
      "completed_at": "2026-01-21T14:45:30.000Z"
    },
    {
      "student_id": 3,
      "username": "John Student",
      "quiz_title": "Advanced JavaScript",
      "score": 78.0,
      "correct_answers": 15,
      "total_questions": 20,
      "completed_at": "2026-01-21T14:52:00.000Z"
    }
  ]
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "All fields are required"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid email or password"
}
```

### 404 Not Found
```json
{
  "error": "Quiz not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to create quiz"
}
```

---

## Database Schema Reference

### users table
```sql
id (INT, PRIMARY KEY, AUTO_INCREMENT)
username (VARCHAR(255))
email (VARCHAR(255), UNIQUE)
password (VARCHAR(255), hashed with bcrypt)
role (ENUM: 'Instructor', 'Student')
created_at (TIMESTAMP)
```

### quizzes table
```sql
id (INT, PRIMARY KEY, AUTO_INCREMENT)
instructor_id (INT, FOREIGN KEY → users.id)
title (VARCHAR(255))
description (TEXT)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

### questions table
```sql
id (INT, PRIMARY KEY, AUTO_INCREMENT)
quiz_id (INT, FOREIGN KEY → quizzes.id)
question_text (TEXT)
question_type (ENUM: 'multiple-choice', 'true-false')
correct_answer (VARCHAR(255))
question_order (INT)
created_at (TIMESTAMP)
```

### question_options table
```sql
id (INT, PRIMARY KEY, AUTO_INCREMENT)
question_id (INT, FOREIGN KEY → questions.id)
option_text (VARCHAR(255))
option_order (INT)
created_at (TIMESTAMP)
```

### student_quiz_attempts table
```sql
id (INT, PRIMARY KEY, AUTO_INCREMENT)
student_id (INT, FOREIGN KEY → users.id)
quiz_id (INT, FOREIGN KEY → quizzes.id)
score (DECIMAL(5,2))
correct_answers (INT)
total_questions (INT)
completed_at (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
```

---

## Usage Examples

### Example 1: Complete Quiz Workflow

#### Step 1: Student takes quiz (frontend calculates)
```javascript
// Quiz is displayed with 4 questions
// Student answers all questions
// Frontend calculates: 3 correct out of 4 = 75%
```

#### Step 2: Submit quiz attempt
```javascript
fetch('http://localhost:5000/api/quizzes/attempts/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    student_id: 2,
    quiz_id: 1,
    score: 75.0,
    correct_answers: 3,
    total_questions: 4
  })
})
```

#### Step 3: Student views grades
```javascript
fetch('http://localhost:5000/api/quizzes/attempts/student/2')
  .then(r => r.json())
  .then(data => {
    console.log(data.attempts) // Shows all quiz results
  })
```

---

### Example 2: Instructor creates quiz

```javascript
fetch('http://localhost:5000/api/quizzes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    instructor_id: 1,
    title: "Biology 101",
    description: "Basic biology concepts",
    questions: [
      {
        question_text: "What is photosynthesis?",
        question_type: "multiple-choice",
        correct_answer: "Process of converting sunlight to chemical energy",
        question_order: 1,
        options: [
          { option_text: "Process of converting sunlight to chemical energy", option_order: 1 },
          { option_text: "Breakdown of glucose", option_order: 2 },
          { option_text: "Protein synthesis", option_order: 3 },
          { option_text: "Cell division", option_order: 4 }
        ]
      }
    ]
  })
})
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication failed |
| 404 | Not Found - Resource not found |
| 500 | Internal Server Error |

---

## Notes

- All passwords are hashed using bcrypt before storage
- All queries use parameterized statements to prevent SQL injection
- Timestamps are stored in UTC
- Scores are stored as DECIMAL(5,2) for precision
- Questions must have at least 1 option for multiple-choice type
- True/False questions have predefined options (no need to store)
- All deletes cascade properly through foreign keys

---

**Last Updated:** January 21, 2026
