import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TriageView from './TriageView.jsx';

async function openOverride(staff,isClinical) {
  render(<TriageView currentStaff={staff} isClinical={isClinical}/>);
  fireEvent.click(await screen.findByRole('button',{name:/Clinical Override Priority/i}));
  const dialog=screen.getByRole('dialog',{name:'Clinical Override Priority'});
  fireEvent.change(within(dialog).getByLabelText(/Clinical Justification Reason/i),{target:{value:'Synthetic review: changed observation findings.'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Confirm Override'}));
  return dialog;
}
describe('Visible clinical decision notifications',()=>{
  it('shows a polite permission failure inside the open override dialog',async()=>{
    const dialog=await openOverride({id:'STAFF-103',name:'Faith',role:'clerk'},false);
    expect(await within(dialog).findByText(/You’re not authorised to override patient priorities/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog',{name:'Clinical Override Priority'})).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('closes the dialog and shows a visible success notification after an authorised override',async()=>{
    await openOverride({id:'STAFF-101',name:'Jane',role:'nurse'},true);
    expect(await screen.findByRole('status')).toHaveTextContent('Priority override successful');
    expect(screen.queryByRole('dialog',{name:'Clinical Override Priority'})).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your decision has been recorded');
    fireEvent.click(within(screen.getByRole('status')).getByRole('button',{name:'Close alert'}));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
