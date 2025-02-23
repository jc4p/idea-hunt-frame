import './style.css';
import * as frame from '@farcaster/frame-sdk';

const API_URL = 'https://idea-hunt-api.kasra.codes';
// const API_URL = 'http://localhost:3000';

async function getCurrencies() {
  const response = await fetch(`${API_URL}/currencies`);
  const data = await response.json();
  return data;
}

const CONTRACT_ADDRESS = '0x14C451E98F1ef59A5D14DA7e6324DDF19c2CB6a0';

const PRICE_LOOKUP = {
  'ETH': 0.001,
  'HIGHER': 100,
  'DEGEN': 300,
  'MOXIE': 300,
  'CLANKER': 0.01,
  'BNKR': 5000
}

getCurrencies().then(currencies => {
  console.log(currencies);
  window.currencies = currencies;
});

function renderIdeas(ideas) {
  const app = document.getElementById('app');
  app.innerHTML = ''; // Clear previous content

  const container = document.createElement('div');
  container.className = 'ideas-container';

  // Header container with title and ADD IDEA button
  const headerContainer = document.createElement('div');
  headerContainer.className = 'header-container';

  const header = document.createElement('h1');
  header.textContent = 'Idea Hunt';
  headerContainer.appendChild(header);

  const addIdeaButton = document.createElement('button');
  addIdeaButton.className = 'add-idea-button';
  addIdeaButton.textContent = 'SUBMIT IDEA';
  addIdeaButton.addEventListener('click', openAddIdeaModal);
  headerContainer.appendChild(addIdeaButton);

  container.appendChild(headerContainer);

  const list = document.createElement('ul');
  list.className = 'ideas-list';

  ideas.forEach(idea => {
    const item = document.createElement('li');
    item.className = 'idea-item';

    const title = document.createElement('h2');
    title.textContent = idea.title;
    item.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = idea.description;
    item.appendChild(desc);

    if (idea.creator_profile) {
      const profileContainer = document.createElement('div');
      profileContainer.className = 'profile-container';

      const profilePic = document.createElement('img');
      profilePic.src = idea.creator_profile.pfp_url;
      profilePic.alt = 'Profile Picture';
      profilePic.className = 'profile-pic';
      profileContainer.appendChild(profilePic);

      const profileName = document.createElement('p');
      profileName.textContent = idea.creator_profile.username;
      profileContainer.appendChild(profileName);

      item.appendChild(profileContainer);
    }

    if (idea.pools && idea.pools.length > 0) {
      const poolsContainer = document.createElement('div');
      poolsContainer.className = 'pools-container';

      idea.pools.forEach(pool => {
        const poolItem = document.createElement('div');
        poolItem.className = 'pool-item';

        const poolIcon = document.createElement('img');
        poolIcon.src = pool.currency_icon_url;
        poolIcon.alt = 'Pool Icon';
        poolIcon.className = 'pool-icon';
        poolItem.appendChild(poolIcon);

        const poolAmount = document.createElement('p');
        if (pool.currency_name == 'ETH') {
          poolAmount.textContent = Number(pool.total_amount).toFixed(3)
        } else {
          poolAmount.textContent = Math.round(Number(pool.total_amount))
        }
        poolItem.appendChild(poolAmount);

        poolsContainer.appendChild(poolItem);
      });

      item.appendChild(poolsContainer);
    }

    // Open vote modal when an idea is clicked
    item.addEventListener('click', () => {
      openModal(idea);
    });

    list.appendChild(item);
  });

  const listFooter = document.createElement('div');
  listFooter.className = 'list-footer';
  listFooter.textContent = 'Upon a completion of an idea the developer will receive 90% of the total amount raised.';

  const footerAddIdeaButton = document.createElement('button');
  footerAddIdeaButton.className = 'add-idea-button';
  footerAddIdeaButton.textContent = 'SUBMIT IDEA';
  footerAddIdeaButton.addEventListener('click', openAddIdeaModal);

  listFooter.appendChild(footerAddIdeaButton);
  list.appendChild(listFooter);

  container.appendChild(list);
  app.appendChild(container);
}

async function fetchIdeas() {
  const response = await fetch(`${API_URL}/ideas`);
  const data = await response.json();
  return data;
}

// Helper functions to show/hide the waiting overlay
function showTransactionOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'transaction-overlay';
  overlay.className = 'transaction-overlay';
  overlay.innerHTML = '<p>WAITING FOR TRANSACTION...</p>';
  document.body.appendChild(overlay);
}

function hideTransactionOverlay() {
  const overlay = document.getElementById('transaction-overlay');
  if (overlay) {
    document.body.removeChild(overlay);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const ideas = await fetchIdeas();
  console.log(ideas);
  renderIdeas(ideas);
  frame.sdk.actions.ready();

  let isOnBase = false;
  try {
    const chainId = await frame.sdk.wallet.ethProvider.request({
      method: 'eth_chainId'
    });
    console.log('Connected to network with chainId:', chainId);
    const chainIdDecimal = typeof chainId === 'number' ? chainId : parseInt(chainId, 16);
    if (chainIdDecimal !== 8453) {
      console.error(`Please connect to Base Mainnet. Current network: ${chainIdDecimal} (${chainId})`);
      return;
    } else {
      isOnBase = true;
    }
  } catch (switchError) {
    console.log('Error switching to Base');
    return;
  }

  if (!isOnBase) {
    console.log("not on base, can't vote");
  }
});

const ethToWei = (eth) => {
  return '0x' + BigInt(Math.floor(eth * 1e18)).toString(16);
};

const submitVote = async (ideaId, currencyId) => {
  console.log('submit vote', ideaId, currencyId);
  const currency = window.currencies.find(c => c.id == currencyId);
  console.log(currency);

  const price = PRICE_LOOKUP[currency.name];

  const fid = await (frame.sdk.context.user).fid;

  let initialVoteResponse;
  try {
    initialVoteResponse = await fetch(`${API_URL}/submit-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ideaId: ideaId,
        currencyId: currencyId,
        coins: price,
        fid: fid
      })
    });
  } catch (error) {
    console.error('Error creating initial vote', error);
    return;
  }
  const initialVoteData = await initialVoteResponse.json();
  const voteId = initialVoteData.id;
  console.log("Initial vote id:", voteId);
  
  const loggedInWallet = await frame.sdk.wallet.ethProvider.request({
    method: 'eth_requestAccounts'
  });

  if (currency.contract_address === 'mainnet') {
    // ETH transfer branch
    let txHash = null;
    try {
      showTransactionOverlay();
      const tx = await frame.sdk.wallet.ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: loggedInWallet[0],
          to: CONTRACT_ADDRESS,
          value: ethToWei(price)
        }]
      });
      hideTransactionOverlay();
      txHash = tx;
      console.log('Transaction sent:', txHash);
    } catch (error) {
      hideTransactionOverlay();
      console.error('Error sending transaction', error);
      return;
    }
    
    await fetch(`${API_URL}/submit-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ideaId: ideaId,
        currencyId: currencyId,
        coins: price,
        fid: fid,
        txHash: txHash
      })
    });

    const ideas = await fetchIdeas();
    renderIdeas(ideas);
  } else {
    // Token (ERC20) transfer branch
    const transferFunctionSignature = '0xa9059cbb';
    const tokenContractAddress = currency.contract_address;
    const recipient = CONTRACT_ADDRESS;
    const recipientPadded = recipient.slice(2).padStart(64, '0');

    const amountHex = ethToWei(price);
    const amountNoPrefix = amountHex.startsWith('0x') ? amountHex.slice(2) : amountHex;
    const paddedAmount = amountNoPrefix.padStart(64, '0');

    const data = `${transferFunctionSignature}${recipientPadded}${paddedAmount}`;

    let txHash = null;
    try {
      showTransactionOverlay();
      const tx = await frame.sdk.wallet.ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: loggedInWallet[0],
          to: tokenContractAddress,
          data: data,
          value: '0x0'
        }]
      });
      hideTransactionOverlay();
      txHash = tx;
      console.log('Transaction sent:', txHash);
    } catch (error) {
      hideTransactionOverlay();
      alert('Error sending transaction', error);
      console.error('Error sending transaction', error);
      return;
    }

    try {
      await fetch(`${API_URL}/finish-vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voteId: voteId,
          txHash: txHash
        })
      });
    } catch (error) {
      console.error('Error updating vote with txHash', error);
      return;
    }

    const ideas = await fetchIdeas();
    renderIdeas(ideas);
  }
};

function openModal(idea) {
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const modalHeader = document.createElement('h2');
  modalHeader.textContent = 'SUPPORT IDEA: ' + idea.title;
  modal.appendChild(modalHeader);

  const currenciesContainer = document.createElement('div');
  currenciesContainer.className = 'currencies-container';

  const voteButton = document.createElement('div');
  voteButton.textContent = 'VOTE';
  voteButton.className = 'vote-button disabled';

  window.currencies.forEach(currency => {
    const option = document.createElement('div');
    option.className = 'currency-option';

    const price = PRICE_LOOKUP[currency.name];
    
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'currency';
    radio.value = currency.id;
    radio.id = `currency-${currency.id}`;
    radio.addEventListener('change', () => {
      voteButton.classList.remove('disabled');
    });
    option.addEventListener('click', () => {
      if (radio.checked) {
        voteButton.classList.remove('disabled');
        voteButton.textContent = `VOTE ${price} ${currency.name}`;
      } else {
        voteButton.classList.add('disabled');
        voteButton.textContent = 'VOTE';
      }
    });
    option.appendChild(radio);
    
    if (currency.icon_url) {
      const logo = document.createElement('img');
      logo.src = currency.icon_url;
      logo.alt = currency.name;
      logo.className = 'currency-logo';
      logo.addEventListener('click', () => option.click());
      option.appendChild(logo);
    }
    
    const label = document.createElement('label');
    label.htmlFor = `currency-${currency.id}`;
    label.textContent = currency.name;
    option.appendChild(label);
    option.addEventListener('click', () => option.click());
    
    currenciesContainer.appendChild(option);
  });

  modal.appendChild(currenciesContainer);
  modal.appendChild(voteButton);

  voteButton.addEventListener('click', () => {
    const selected = modal.querySelector('input[name="currency"]:checked');
    if (selected) {
      submitVote(idea.id, selected.value);
      document.body.removeChild(modalOverlay);
    }
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  });

  modalOverlay.appendChild(modal);
  document.body.appendChild(modalOverlay);
}

function openAddIdeaModal() {
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  
  const modalHeader = document.createElement('h2');
  modalHeader.textContent = 'ADD NEW IDEA';
  modal.appendChild(modalHeader);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = 'Idea Title';
  titleInput.className = 'idea-title-input';
  modal.appendChild(titleInput);

  const descriptionInput = document.createElement('textarea');
  descriptionInput.placeholder = 'Idea Description';
  descriptionInput.className = 'idea-description-input';
  modal.appendChild(descriptionInput);

  const submitButton = document.createElement('button');
  submitButton.textContent = 'SUBMIT';
  submitButton.className = 'submit-idea-button';
  submitButton.addEventListener('click', async () => {
    submitButton.disabled = true; // Prevent further clicks
  
    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();
    if (!title || !description) {
      alert('Please enter both title and description.');
      submitButton.disabled = false;
      return;
    }
    try {
      const fid = await frame.sdk.context.user.fid;
      const response = await fetch(`${API_URL}/submit-idea`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, creatorFid: fid })
      });
      if (!response.ok) {
        throw new Error('Failed to submit idea.');
      }
      const ideas = await fetchIdeas();
      renderIdeas(ideas);
    } catch (error) {
      console.error('Error submitting idea', error);
    }
    document.body.removeChild(modalOverlay);
  }, { once: true });
  
  modal.appendChild(submitButton);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  });
  modalOverlay.appendChild(modal);
  document.body.appendChild(modalOverlay);
}
