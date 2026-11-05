// useId creates a unique identifier for each FormField instance.
// This connects the label, input, hint, and error message.
import { useId } from 'react'

// This component renders a labelled input with an optional hint
// and validation message.
//
// Example:
// <FormField
//   label="Email"
//   name="email"
//   type="email"
//   value={email}
//   onChange={(event) => setEmail(event.target.value)}
//   autoComplete="email"
//   required
// />

function FormField({
  label,
  id,
  type = 'text',
  hint,
  error,
  className = '',
  'aria-describedby': externalDescription,
  'aria-invalid': externalInvalid,
  ...inputProps
}) {
  // Hooks must be called on every render, even if an id was supplied.
  const generatedId = useId()

  // Use the caller's id when provided. Otherwise, use the generated id.
  const inputId = id ?? generatedId

  // Derive related element IDs from the input's unique ID.
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  // aria-describedby accepts a space-separated list of element IDs.
  // Include only descriptions that actually appear on the page.
  // Preserve any description supplied by the calling component.
  const descriptionIds = [
    externalDescription,
    hint ? hintId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ')

  const fieldClasses = [
    'ui-field',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    // Group the label, input, and supporting messages together.
    // className applies to this outer container.
    <div className={fieldClasses}>
      {/* htmlFor connects the label to its input.
          Clicking the label focuses the input. */}
      <label
        className="ui-field-label"
        htmlFor={inputId}
      >
        {label}
      </label>

      {/* Forward input attributes such as name, value, onChange,
          required, disabled, placeholder, and autoComplete.
          
          Explicit attributes below keep the input connected to
          this component's label and supporting messages. */}
      <input
        {...inputProps}
        id={inputId}
        type={type}
        aria-describedby={descriptionIds || undefined}
        aria-invalid={error ? true : externalInvalid}
      />

      {/* A hint gives instructions before an error occurs.
          For example: "Use at least 8 characters." */}
      {hint && (
        <p
          className="ui-field-hint"
          id={hintId}
        >
          {hint}
        </p>
      )}

      {/* The parent form provides the error message.
          This component displays it; it does not perform validation.
          
          role="alert" helps announce an error when it appears
          after the user interacts with the form. */}
      {error && (
        <p
          className="ui-field-error"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}

// Export the component so forms can reuse the same field structure.
// This version supports input elements. Selects and textareas can
// receive their own reusable components when needed.
export default FormField