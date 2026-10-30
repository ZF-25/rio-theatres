# Rio Theaters

A full-stack cinema ticket booking web application developed as part of the **Advanced Web Applications Project** course at Oulu University of Applied Sciences (OAMK).

The application will allow customers to browse movies, explore screenings, select seats, and book cinema tickets online.

Rio Theaters will operate in two Finnish cities: **Oulu and Tampere**.

## 1. Project Overview

Rio Theaters aims to provide a user-friendly online cinema booking experience.

The system will support three main user groups:

- **Guests:** Browse movies, view screenings, and book tickets without creating an account.
- **Registered customers:** Book tickets, log in, and view their booking history.
- **Administrators:** Manage screenings and monitor bookings and seat availability.

### Main Features

- Movie listings, details, posters, and trailers
- Cinema and screening selection
- Interactive seat selection
- Real-time seat availability
- Prevention of double bookings
- Temporary seat reservations (15 minutes)
- Guest and registered-user booking
- Simulated payment process
- Booking confirmation
- Customer registration and login
- Booking history
- Admin dashboard and screening management
- Children's ticket discounts and movie age warnings

Some advanced features may be adjusted based on customer feedback and the approved project scope.

## 2. Technology Stack

| Component           | Technology                               |
| ------------------- | ---------------------------------------- |
| Frontend            | React, Vite, JavaScript, CSS             |
| Backend             | Node.js, Express.js                      |
| Database            | PostgreSQL                               |
| Version Control     | Git and GitHub                           |
| Project Management  | GitHub Issues and Projects               |
| Frontend Deployment | Render Static Site (planned)             |
| Backend Deployment  | Render Web Service (planned)             |
| Database Hosting    | PostgreSQL hosting 
| Testing             | Frontend, backend, and integration tests |

## 3. Team Members and Responsibilities

### Zainab — Frontend Developer

Responsible for:

- React frontend setup and project structure
- Application routing and reusable components
- Homepage and movie listing
- Movie details
- Cinema and screening selection
- Registration and login interfaces
- Interactive seating map
- Checkout and booking confirmation
- Booking history interface
- Admin dashboard and screening management interfaces
- Frontend testing and responsive design
- Frontend deployment

### Ruvindra — Customer Backend Developer

Responsible for:

- Node.js and Express backend
- Customer-facing REST APIs
- Movie and screening APIs
- External movie API integration
- Movie data caching
- Seat availability and booking transactions
- Double-booking prevention
- Temporary seat holds
- Simulated payment processing
- Ticket pricing and booking validation
- Backend testing and deployment

### Marina — Database, Authentication and Admin Backend Developer

Responsible for:

- PostgreSQL database design
- Entity Relationship Diagram (ERD)
- Database tables, relationships, and constraints
- Database migrations and seed data
- Customer registration and login APIs
- Password hashing and authentication
- Role-based access control
- Booking history APIs
- Admin screening management APIs
- Database testing and deployment

All team members participate in planning, documentation, code reviews, testing, and project presentations.

## 4. Project Structure

```text
rio-theatres/
│
├── frontend/           # React + Vite application
│
├── backend/            # Node.js + Express application
│
├── database/           # PostgreSQL schema and migrations
│
├── docs/               # Project documentation
│
├── .gitignore
└── README.md
```

## 5. Local Development Setup

### Prerequisites

Before running the application, install:

- Git
- Node.js and npm
- Visual Studio Code or another code editor
- PostgreSQL (required when database integration begins)

### Clone the Repository

```bash
git clone https://github.com/ZF-25/rio-theatres.git
cd rio-theatres
```

### Run the Frontend

The frontend uses React and Vite.

```bash
cd frontend
npm install
npm run dev
```

Open the local address displayed by Vite, usually:

`http://localhost:5173`

The application currently displays a **Rio Theaters Hello World page** to verify the local frontend environment.

### Run the Backend

Open a separate terminal.

From the repository root:

```bash
cd backend
npm install
node server.js
```

The Express server runs locally at:

`http://localhost:5000`

The initial backend responds with:

`Hello World from Rio Theaters Backend!`

### Database Setup

PostgreSQL setup and database integration are planned as part of the project.

Database connection instructions, migrations, and seed-data commands will be documented once implemented.

### Current Limitation

The frontend and backend Hello World applications have been tested separately.

Frontend-to-backend communication and PostgreSQL integration are not yet complete.

## 6. Six-Week Development Plan

| Week  | Frontend — Zainab                                                                    | Customer Backend — Ruvindra                                                                | Database, Authentication & Admin Backend — Marina                                        |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **1** | React setup, routing, wireframes, Render Hello World frontend                        | Express setup, API contracts, Render Hello World backend                                   | ERD, PostgreSQL setup, database provisioning, authentication design                      |
| **2** | Homepage, movie listing/details, cinema and screening selection, login/register UI   | Movie APIs, screening APIs, external movie API integration, movie caching                  | Database tables, seed data, registration, login, logout, password hashing                |
| **3** | Interactive seating map, seat selection, booking summary                             | Seat availability, booking transactions, double-booking prevention, owner-seat restriction | Seating schema, booking constraints, authentication middleware, initial admin APIs       |
| **4** | Checkout, 15-minute countdown, booking confirmation, booking history UI              | Seat holds, expiration handling, simulated payments, booking confirmation                  | Hold/payment tables, booking history API, role-based authorization, admin screening APIs |
| **5** | Admin dashboard, screening forms, booking overview, children's tickets, age warnings | Children's discount, pricing validation, booking restrictions, caching improvements        | Complete admin APIs, admin authorization, database integration and optimization          |
| **6** | Frontend/Cypress tests, UI fixes, Render frontend deployment verification            | Backend/concurrency tests, API documentation, Render backend deployment verification       | Database/auth/admin tests, production migrations, database deployment verification       |

The schedule may be adjusted based on customer feedback, technical dependencies, and team progress.

## 7. Git Workflow

The team uses GitHub feature branches and pull requests.

### Main Branch

`main` contains the reviewed and integrated project code.

### Feature Branches

Each feature is developed in a separate branch.

Examples:

```text
feature/frontend-setup
feature/backend-setup
feature/movie-listing
feature/seat-selection
feature/authentication
feature/admin-dashboard
```

### Development Process

1. Create or select a GitHub Issue.
2. Create a feature branch from the latest `main`.
3. Implement and test the feature locally.
4. Commit changes with a descriptive message.
5. Push the branch to GitHub.
6. Create a pull request.
7. Request a teammate's review.
8. Merge the approved changes into `main`.

## 8. Testing

Testing will include:

- Frontend component and user-flow tests
- Backend API tests
- Database and authentication tests
- Booking and seat availability validation
- Double-booking prevention tests
- End-to-end booking tests
- Responsive interface testing

## 9. Deployment

The team plans to deploy the application using Render.

Planned deployment components:

- React frontend as a static site
- Express backend as a web service
- PostgreSQL database using a suitable hosted database service

Deployment instructions and public application links will be added after successful deployment.

## 10. Project Documentation

Project documentation is maintained in the `docs/` directory and through GitHub Issues and Projects.

Documentation includes:

- Requirements Specification
- Project Plan
- Product Backlog
- Architecture and API contracts
- Database ERD
- Wireframes
- Testing documentation
- Deployment instructions
- Final project report

## 11. Project Information

**Project:** Rio Theaters
**Course:** Advanced Web Applications Project
**Institution:** Oulu University of Applied Sciences (OAMK)
**Academic Term:** Autumn 2026
**Team Size:** 3 students
**Project Duration:** 6 weeks

---

**Rio Theaters**
