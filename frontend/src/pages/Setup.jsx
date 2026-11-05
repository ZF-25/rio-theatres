// useState lets this page remember values between renders.
// We use it for the entered name, validation error, and success message.
import { useState } from 'react'

// Import our reusable UI components.
// Keeping these in separate files allows other pages to use
// the same appearance and behaviour.
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import FormField from '../components/ui/FormField.jsx'

// Setup demonstrates the frontend foundation and shared components.
// It is a development example, not a customer registration page.
function Setup() {
  // name stores the current value of the name input.
  // The initial value is an empty string.
  const [name, setName] = useState('')

  // error stores the validation message.
  // An empty string means there is no error to display.
  const [error, setError] = useState('')

  // notice stores the message displayed after a valid submission.
  const [notice, setNotice] = useState('')

  // React calls this function when the form is submitted.
  // This happens when the user clicks the submit button or presses
  // Enter while focused on the input.
  function handleSubmit(event) {
    // The browser normally submits a form by navigating or refreshing.
    // Prevent that default action because React handles this example.
    event.preventDefault()

    // Remove spaces from the beginning and end of the entered name.
    // This also prevents a name containing only spaces from passing.
    const trimmedName = name.trim()

    // Validate the value before showing a success message.
    if (!trimmedName) {
      setError('Enter your name to try the example form.')

      // Clear any previous success message so the page does not
      // show conflicting feedback.
      setNotice('')

      // Stop here because the form is not valid.
      return
    }

    // A valid submission removes any previous error.
    setError('')

    // Template literals allow JavaScript values inside ${...}.
    // React displays the name as text rather than treating it as HTML.
    setNotice(
      `Hello, ${trimmedName}! The example form works. No data was saved.`,
    )
  }

  // Return the example to its original state.
  // This is a normal button action, not a form submission.
  function resetExample() {
    setName('')
    setError('')
    setNotice('')
  }

  return (
    // The container class limits the width and centres the content.
    // page-section adds consistent spacing above and below the page.
    //
    // aria-labelledby connects this section to its visible heading.
    <section
      className="container page-section"
      aria-labelledby="setup-title"
    >
      {/* The main heading describes the purpose of this page.
          Its id matches the section's aria-labelledby value. */}
      <h1 id="setup-title">Frontend setup</h1>

      {/* This shared class gives introductory text a muted colour
          and consistent spacing. */}
      <p className="page-introduction">
        Shared layout and reusable component examples.
      </p>

      {/* The grid places cards side by side on larger screens.
          Responsive CSS changes it to one column on small screens. */}
      <div className="component-grid">
        {/* Card supplies the shared background, border, and padding.
            Everything inside it is passed as the children prop. */}
        <Card>
          <h2>Project foundation</h2>

          {/* These paragraphs describe the existing setup.
              They do not perform any checks or API requests. */}
          <p>Frontend: React + Vite</p>

          <p>Routing: React Router</p>

          <p>
            Customer and administrator pages use shared layouts.
          </p>

          <p>
            The Home page demonstrates loading, API success,
            and error handling.
          </p>
        </Card>

        {/* Reuse the same Card component for a different purpose.
            The content changes, but the container stays consistent. */}
        <Card>
          <h2>Example form</h2>

          <p>
            Try the shared form field and button components.
            This example does not create an account.
          </p>

          {/* onSubmit passes the submission event to handleSubmit.
              
              noValidate disables the browser's automatic validation
              popup so we can demonstrate our own error message.
              Validation still happens in handleSubmit. */}
          <form onSubmit={handleSubmit} noValidate>
            {/* FormField renders the label, input, hint, and error.
                
                label: visible text describing the field.
                name: identifies the field in form data.
                value: connects the input to React state.
                onChange: updates state whenever the user types.
                autoComplete: tells the browser this is a name field.
                maxLength: limits the number of characters entered.
                hint: supplies instructions below the input.
                error: displays our validation message when present.
                required: marks the input as required.
                
                FormField generates its own unique input id and
                connects the label and supporting messages to it. */}
            <FormField
              label="Name"
              name="name"
              value={name}
              onChange={(event) => {
                // Store the input's latest value.
                setName(event.target.value)

                // Remove old feedback while the user edits the field.
                setError('')
                setNotice('')
              }}
              autoComplete="name"
              maxLength={100}
              hint="Enter a name to test the reusable field."
              error={error}
              required
            />

            {/* Shared CSS places the buttons together and allows
                them to wrap when there is not enough horizontal space. */}
            <div className="component-actions">
              {/* Explicitly set type="submit" so this button
                  triggers the form's onSubmit handler.
                  
                  The default variant is primary, giving this
                  button the red background from App.css. */}
              <Button type="submit">
                Try example
              </Button>

              {/* The secondary variant uses the outlined style.
                  
                  Button defaults to type="button", so clicking
                  Reset runs resetExample without submitting the form. */}
              <Button
                variant="secondary"
                onClick={resetExample}
              >
                Reset
              </Button>
            </div>

            {/* Conditional rendering: show this paragraph only
                when notice contains a message.
                
                role="status" helps screen readers announce
                the result without interrupting the user. */}
            {notice && (
              <p role="status">{notice}</p>
            )}
          </form>
        </Card>
      </div>
    </section>
  )
}

// Export Setup so App.jsx can render it at the /setup route.
export default Setup