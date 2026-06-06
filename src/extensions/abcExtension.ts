import { renderAbc } from 'abcjs';
import extensionSvc from '../services/extensionSvc';

const render = (elt: HTMLElement): void => {
  const content = elt.textContent;
  // Create a div element
  const divElt = document.createElement('div');
  divElt.className = 'abc-notation-block';
  // Replace the pre element with the div
  elt.parentNode!.parentNode!.replaceChild(divElt, elt.parentNode!);
  renderAbc(divElt, content as string, {});
};

extensionSvc.onGetOptions((options, properties: any) => {
  options.abc = properties.extensions.abc.enabled;
});

extensionSvc.onSectionPreview((elt: HTMLElement) => {
  elt.querySelectorAll<HTMLElement>('.prism.language-abc')
    .forEach(notationElt => render(notationElt));
});
